export class AppError extends Error {
  status: number;
  code: string;

  constructor(status: number, message: string, code = 'BAD_REQUEST') {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
  }
}

export function formatErrorResponse(error: string, code = 'ERROR') {
  return {
    ok: false as const,
    error,
    code,
  };
}
