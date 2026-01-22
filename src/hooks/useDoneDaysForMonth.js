// src/hooks/useDoneDaysForMonth.js
import { useEffect, useState } from "react";
import supabase from "../supabaseClient";
import { toKstDayKey } from "../utils/dateKst";

export const useDoneDaysForMonth = ({ open, userId, calMonth }) => {
  const [doneDayKeys, setDoneDayKeys] = useState(() => new Set());

  useEffect(() => {
    if (!open) return;
    if (!userId) return;

    const run = async () => {
      const monthStart = new Date(calMonth.y, calMonth.m, 1);
      const monthEnd = new Date(calMonth.y, calMonth.m + 1, 0);

      const startKey = toKstDayKey(monthStart);
      const endKey = toKstDayKey(monthEnd);

      try {
        const { data, error } = await supabase
          .from("hall_of_fame")
          .select("day_key")
          .eq("user_id", userId)
          .gte("day_key", startKey)
          .lte("day_key", endKey);

        if (error) throw error;

        setDoneDayKeys(new Set((data ?? []).map((x) => x.day_key)));
      } catch (e) {
        console.error("useDoneDaysForMonth error:", e);
        setDoneDayKeys(new Set());
      }
    };

    run();
  }, [open, userId, calMonth.y, calMonth.m]);

  return doneDayKeys;
};
