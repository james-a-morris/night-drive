import type { PreferenceName } from "../src/prefs.ts";
import { useEffect, useState } from "react";
import { PREFERENCES, readPreference, savePreference } from "../src/prefs.ts";

export function usePreference<K extends PreferenceName>(name: K) {
  const [value, setValue] = useState(PREFERENCES[name].fallback);
  useEffect(() => {
    const update = () => setValue(readPreference(name));
    update();
    const onStorage = (event: StorageEvent) => {
      if (event.key === PREFERENCES[name].key || event.key === null) update();
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [name]);
  return [
    value,
    (next: ReturnType<typeof readPreference<K>>) => {
      savePreference(name, next);
      setValue(next);
    },
  ] as const;
}
