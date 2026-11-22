import { Review } from '../../shared/model';
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public review?: Review,
  ) {
    super(message);
  }
}
export async function api<T>(path: string, body?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(
      '/api/' + path,
      body === undefined
        ? {}
        : {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-My-Space': '1' },
            body: JSON.stringify(body),
          },
    );
  } catch {
    throw new Error('לא ניתן להתחבר לשרת. יש לבדוק את החיבור ולנסות שוב.');
  }
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    if (response.status === 429)
      throw new ApiError(429, 'בוצעו ניסיונות כניסה רבים. אפשר לנסות שוב בעוד דקה.');
    throw new ApiError(
      response.status,
      response.status >= 500 && response.status !== 503
        ? 'אירעה שגיאה בשרת. יש לנסות שוב.'
        : error.message || 'הפעולה נכשלה',
      error.affected ? error : undefined,
    );
  }
  return response.json();
}
