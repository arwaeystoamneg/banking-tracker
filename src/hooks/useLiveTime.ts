import { useEffect, useState } from "react";
import { currentTimeString } from "@/lib/dates";

/** Follows the clock until the user edits the field, so a form left open doesn't save a stale time. */
export function useLiveTime(initial: string): [string, (value: string) => void, () => string] {
  const [value, setValue] = useState(initial || currentTimeString());
  const [touched, setTouched] = useState(Boolean(initial));
  useEffect(() => {
    if (touched) return;
    const timer = setInterval(() => setValue(currentTimeString()), 15_000);
    return () => clearInterval(timer);
  }, [touched]);
  return [
    value,
    (next) => {
      setTouched(true);
      setValue(next);
    },
    () => (touched ? value : currentTimeString()),
  ];
}
