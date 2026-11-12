import { getApiBaseUrl, ApiError } from "./api";

export async function financialRequest<T>(
  path: string,
  body: unknown,
  key: string,
  method = "POST",
): Promise<T> {
  const token = localStorage.getItem("auth_token");
  const response = await fetch(`${getApiBaseUrl()}/finance${path}`, {
    method,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      "x-requested-with": "XMLHttpRequest",
      "Idempotency-Key": key,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  const result = await response.json();
  if (!response.ok)
    throw new ApiError(
      result.error?.details
        ?.map(
          (d: { field: string; message: string }) => `${d.field}: ${d.message}`,
        )
        .join("; ") ||
        result.error?.message ||
        "Financial request failed",
      result.error?.code ?? "FINANCE_ERROR",
      response.status,
    );
  return result.data;
}
export async function downloadFinance(path: string, filename: string) {
  const token = localStorage.getItem("auth_token");
  const response = await fetch(`${getApiBaseUrl()}/finance${path}`, {
    credentials: "include",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!response.ok) {
    const result = await response.json();
    throw new Error(result.error?.message ?? "Download failed");
  }
  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
