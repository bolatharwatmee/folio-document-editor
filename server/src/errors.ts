export class HttpError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function unauthorized(message = "Sign in to continue."): HttpError {
  return new HttpError(401, "unauthorized", message);
}

export function forbidden(message = "You do not have permission to do that."): HttpError {
  return new HttpError(403, "forbidden", message);
}

export function notFound(message = "Not found."): HttpError {
  return new HttpError(404, "not_found", message);
}

export function badRequest(code: string, message: string): HttpError {
  return new HttpError(400, code, message);
}
