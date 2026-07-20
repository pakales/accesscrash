import { z } from "zod";

export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;
export const MAX_TEXT_SOURCE_BYTES = 96 * 1024;

const MAX_SOURCE_NAME_LENGTH = 120;
const MAX_JSON_BODY_BYTES = MAX_TEXT_SOURCE_BYTES + 16 * 1024;
const MAX_MULTIPART_BODY_BYTES = MAX_UPLOAD_BYTES + 128 * 1024;
const MIN_SOURCE_TEXT_LENGTH = 40;

const JsonCompileRequestSchema = z
  .object({
    sourceText: z.string().min(MIN_SOURCE_TEXT_LENGTH),
    sourceName: z.string().min(1).max(MAX_SOURCE_NAME_LENGTH).optional(),
  })
  .strict();

export type TextCompileSource = {
  kind: "text";
  sourceName: string;
  sourceText: string;
};

export type PdfCompileSource = {
  kind: "pdf";
  fileName: string;
  sourceName: string;
  bytes: Uint8Array;
};

export type CompileSource = TextCompileSource | PdfCompileSource;

export type CompileRequestErrorCode =
  | "invalid_origin"
  | "unsupported_media_type"
  | "payload_too_large"
  | "invalid_request"
  | "unsupported_file"
  | "invalid_encoding";

export class CompileRequestError extends Error {
  readonly code: CompileRequestErrorCode;
  readonly status: number;

  constructor(
    code: CompileRequestErrorCode,
    status: number,
    message: string,
  ) {
    super(message);
    this.name = "CompileRequestError";
    this.code = code;
    this.status = status;
  }
}

export async function parseCompileRequest(request: Request): Promise<CompileSource> {
  validateRequestOrigin(request);

  const contentType = request.headers.get("content-type");
  const mediaType = contentType?.split(";", 1)[0]?.trim().toLowerCase();

  if (mediaType === "application/json") {
    return parseJsonRequest(request);
  }

  if (mediaType === "multipart/form-data" && contentType) {
    return parseMultipartRequest(request, contentType);
  }

  throw new CompileRequestError(
    "unsupported_media_type",
    415,
    "Use application/json or multipart/form-data.",
  );
}

export function validateRequestOrigin(request: Request): void {
  const fetchSite = request.headers.get("sec-fetch-site")?.toLowerCase();
  if (fetchSite && fetchSite !== "same-origin" && fetchSite !== "none") {
    throw new CompileRequestError(
      "invalid_origin",
      403,
      "Cross-origin compilation requests are not allowed.",
    );
  }

  const originHeader = request.headers.get("origin");
  if (!originHeader) return;

  let suppliedOrigin: string;
  try {
    suppliedOrigin = new URL(originHeader).origin;
  } catch {
    throw new CompileRequestError(
      "invalid_origin",
      403,
      "The request origin is invalid.",
    );
  }

  const expectedOrigin = new URL(request.url).origin;
  if (originHeader === "null" || suppliedOrigin !== expectedOrigin) {
    throw new CompileRequestError(
      "invalid_origin",
      403,
      "Cross-origin compilation requests are not allowed.",
    );
  }
}

async function parseJsonRequest(request: Request): Promise<TextCompileSource> {
  const bytes = await readBoundedBody(request, MAX_JSON_BODY_BYTES);
  const rawText = decodeUtf8(bytes, "The JSON request must be valid UTF-8.");

  let unknownBody: unknown;
  try {
    unknownBody = JSON.parse(rawText);
  } catch {
    throw new CompileRequestError(
      "invalid_request",
      400,
      "The JSON request body is invalid.",
    );
  }

  const parsed = JsonCompileRequestSchema.safeParse(unknownBody);
  if (!parsed.success) {
    throw new CompileRequestError(
      "invalid_request",
      400,
      "Provide only sourceText and an optional sourceName.",
    );
  }

  const sourceText = normalizeSourceText(parsed.data.sourceText);
  enforceTextBounds(sourceText);

  return {
    kind: "text",
    sourceName: normalizeSourceName(
      parsed.data.sourceName ?? "Pasted application instructions",
    ),
    sourceText,
  };
}

async function parseMultipartRequest(
  request: Request,
  contentType: string,
): Promise<CompileSource> {
  if (!/;\s*boundary=(?:"[^"]+"|[^;\s]+)/i.test(contentType)) {
    throw new CompileRequestError(
      "invalid_request",
      400,
      "The multipart boundary is missing.",
    );
  }

  const bytes = await readBoundedBody(request, MAX_MULTIPART_BODY_BYTES);
  const boundedRequest = new Request(request.url, {
    method: "POST",
    headers: { "content-type": contentType },
    body: exactArrayBuffer(bytes),
  });

  let formData: FormData;
  try {
    formData = await boundedRequest.formData();
  } catch {
    throw new CompileRequestError(
      "invalid_request",
      400,
      "The multipart request body is invalid.",
    );
  }

  const keys = [...new Set(formData.keys())];
  if (keys.some((key) => key !== "file" && key !== "sourceName")) {
    throw new CompileRequestError(
      "invalid_request",
      400,
      "Multipart requests may contain only file and sourceName.",
    );
  }

  const files = formData.getAll("file");
  const sourceNames = formData.getAll("sourceName");
  if (
    files.length !== 1 ||
    !(files[0] instanceof File) ||
    sourceNames.length > 1 ||
    (sourceNames[0] !== undefined && typeof sourceNames[0] !== "string")
  ) {
    throw new CompileRequestError(
      "invalid_request",
      400,
      "Provide exactly one uploaded file and at most one sourceName.",
    );
  }

  const file = files[0];
  if (file.size === 0) {
    throw new CompileRequestError(
      "invalid_request",
      400,
      "The uploaded file is empty.",
    );
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new CompileRequestError(
      "payload_too_large",
      413,
      "Uploads must be 4 MiB or smaller.",
    );
  }

  const fileName = normalizeFileName(file.name);
  const sourceName = normalizeSourceName(
    (sourceNames[0] as string | undefined) || fileName,
  );
  const extension = fileExtension(fileName);
  const declaredType = file.type.toLowerCase().split(";", 1)[0]?.trim();
  const fileBytes = new Uint8Array(await file.arrayBuffer());

  if (extension === ".pdf") {
    if (
      declaredType &&
      declaredType !== "application/pdf" &&
      declaredType !== "application/octet-stream"
    ) {
      throw unsupportedFileError();
    }
    if (!hasPdfSignature(fileBytes)) {
      throw new CompileRequestError(
        "unsupported_file",
        415,
        "The uploaded PDF does not have a valid PDF signature.",
      );
    }

    return {
      kind: "pdf",
      fileName,
      sourceName,
      bytes: fileBytes,
    };
  }

  if (extension === ".txt" || extension === ".md") {
    const permittedTextTypes = new Set([
      "",
      "application/octet-stream",
      "text/markdown",
      "text/plain",
      "text/x-markdown",
    ]);
    if (!permittedTextTypes.has(declaredType)) {
      throw unsupportedFileError();
    }
    if (fileBytes.byteLength > MAX_TEXT_SOURCE_BYTES) {
      throw new CompileRequestError(
        "payload_too_large",
        413,
        "Text sources must be 96 KiB or smaller.",
      );
    }

    const sourceText = normalizeSourceText(
      decodeUtf8(fileBytes, "Text files must use valid UTF-8 encoding."),
    );
    enforceTextBounds(sourceText);

    return {
      kind: "text",
      sourceName,
      sourceText,
    };
  }

  throw unsupportedFileError();
}

async function readBoundedBody(
  request: Request,
  maximumBytes: number,
): Promise<Uint8Array> {
  const statedLength = request.headers.get("content-length");
  if (statedLength !== null) {
    const parsedLength = Number(statedLength);
    if (!Number.isSafeInteger(parsedLength) || parsedLength < 0) {
      throw new CompileRequestError(
        "invalid_request",
        400,
        "The request content length is invalid.",
      );
    }
    if (parsedLength > maximumBytes) {
      throw new CompileRequestError(
        "payload_too_large",
        413,
        "The compilation request is too large.",
      );
    }
  }

  if (!request.body) {
    throw new CompileRequestError(
      "invalid_request",
      400,
      "The request body is required.",
    );
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;

      totalBytes += value.byteLength;
      if (totalBytes > maximumBytes) {
        await reader.cancel();
        throw new CompileRequestError(
          "payload_too_large",
          413,
          "The compilation request is too large.",
        );
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const body = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

function enforceTextBounds(sourceText: string): void {
  if (sourceText.length < MIN_SOURCE_TEXT_LENGTH) {
    throw new CompileRequestError(
      "invalid_request",
      400,
      `Source text must contain at least ${MIN_SOURCE_TEXT_LENGTH} characters.`,
    );
  }
  if (new TextEncoder().encode(sourceText).byteLength > MAX_TEXT_SOURCE_BYTES) {
    throw new CompileRequestError(
      "payload_too_large",
      413,
      "Text sources must be 96 KiB or smaller.",
    );
  }
}

function normalizeSourceText(value: string): string {
  const normalized = value.replace(/^\uFEFF/, "").trim();
  if (normalized.includes("\u0000")) {
    throw new CompileRequestError(
      "invalid_encoding",
      400,
      "Source text may not contain null bytes.",
    );
  }
  return normalized;
}

function normalizeSourceName(value: string): string {
  const normalized = value.normalize("NFKC").replace(/\s+/g, " ").trim();
  if (
    normalized.length === 0 ||
    normalized.length > MAX_SOURCE_NAME_LENGTH ||
    /[\u0000-\u001F\u007F]/.test(normalized)
  ) {
    throw new CompileRequestError(
      "invalid_request",
      400,
      `sourceName must be between 1 and ${MAX_SOURCE_NAME_LENGTH} safe characters.`,
    );
  }
  return normalized;
}

function normalizeFileName(value: string): string {
  const baseName = value.split(/[\\/]/).pop() ?? "";
  return normalizeSourceName(baseName);
}

function fileExtension(fileName: string): string {
  const lastDot = fileName.lastIndexOf(".");
  return lastDot >= 0 ? fileName.slice(lastDot).toLowerCase() : "";
}

function hasPdfSignature(bytes: Uint8Array): boolean {
  const searchLimit = Math.min(bytes.byteLength, 1024);
  const signature = [0x25, 0x50, 0x44, 0x46, 0x2d];

  for (let offset = 0; offset <= searchLimit - signature.length; offset += 1) {
    if (signature.every((byte, index) => bytes[offset + index] === byte)) {
      return true;
    }
  }
  return false;
}

function decodeUtf8(bytes: Uint8Array, message: string): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new CompileRequestError("invalid_encoding", 400, message);
  }
}

function exactArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

function unsupportedFileError(): CompileRequestError {
  return new CompileRequestError(
    "unsupported_file",
    415,
    "Upload a valid PDF, TXT, or Markdown file.",
  );
}
