"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "attendance_email";

export function useEmployeeEmail() {
  const [email, setEmailState] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage isn't available during SSR, must read after mount
    setEmailState(localStorage.getItem(STORAGE_KEY));
    setLoaded(true);
  }, []);

  function setEmail(value: string) {
    localStorage.setItem(STORAGE_KEY, value);
    setEmailState(value);
  }

  function clearEmail() {
    localStorage.removeItem(STORAGE_KEY);
    setEmailState(null);
  }

  return { email, setEmail, clearEmail, loaded };
}
