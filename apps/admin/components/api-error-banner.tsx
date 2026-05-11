"use client";

import { useEffect, useState } from "react";
import { ApiError, onApiError } from "../lib/api";

export function ApiErrorBanner() {
  const [message, setMessage] = useState("");

  useEffect(() => {
    return onApiError((error: ApiError) => {
      setMessage(error.message);
      window.setTimeout(() => {
        setMessage((current) => (current === error.message ? "" : current));
      }, 3500);
    });
  }, []);

  if (!message) return null;

  return (
    <div className="fixed right-4 top-4 z-[70] max-w-md rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 shadow-lg dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">
      {message}
    </div>
  );
}

