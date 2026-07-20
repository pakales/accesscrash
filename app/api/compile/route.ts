import {
  compileAccessProcess,
  type CompileResponseEnvelope,
} from "../../../lib/openai-compiler";
import {
  CompileRequestError,
  parseCompileRequest,
  type CompileSource,
} from "../../../lib/request-security";

export type CompileFunction = (
  source: CompileSource,
) => Promise<CompileResponseEnvelope>;

export type CompileHandlerDependencies = {
  compile?: CompileFunction;
};

const RESPONSE_HEADERS = {
  "cache-control": "no-store, max-age=0",
  "content-security-policy": "default-src 'none'",
  "referrer-policy": "no-referrer",
  "x-content-type-options": "nosniff",
  vary: "Origin",
} as const;

export function createCompileHandler(
  dependencies: CompileHandlerDependencies = {},
) {
  const compile = dependencies.compile ?? compileAccessProcess;

  return async function handleCompile(request: Request): Promise<Response> {
    try {
      const source = await parseCompileRequest(request);
      const result = await compile(source);

      return jsonResponse(result, 200);
    } catch (error) {
      if (error instanceof CompileRequestError) {
        return jsonResponse(
          {
            error: {
              code: error.code,
              message: error.message,
            },
          },
          error.status,
        );
      }

      return jsonResponse(
        {
          error: {
            code: "compile_failed",
            message: "The source could not be compiled. Try again or use the bundled demonstration.",
          },
        },
        500,
      );
    }
  };
}

const defaultCompileHandler = createCompileHandler();

export async function POST(request: Request): Promise<Response> {
  return defaultCompileHandler(request);
}

function jsonResponse(body: unknown, status: number): Response {
  return Response.json(body, {
    status,
    headers: RESPONSE_HEADERS,
  });
}
