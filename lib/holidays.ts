import { sriLankaHolidays } from "./sri-lanka-holidays";

export type PublicHoliday = { date: string; name: string };
export type HolidayMarks = ReadonlyMap<string, readonly string[]>;

export async function holidayCountries() {
  const { default: Holidays } = await import("date-holidays");
  return Object.entries(new Holidays().getCountries("en"))
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function publicHolidays(
  country: string,
  firstYear: number,
  lastYear: number,
) {
  const { default: Holidays } = await import("date-holidays");
  const calendar = new Holidays();
  if (!Object.hasOwn(calendar.getCountries(), country))
    throw new Error("Unsupported holiday country.");
  calendar.init(country);

  const holidays: PublicHoliday[] = [];
  for (let year = firstYear; year <= lastYear; year++) {
    const official = country === "LK" ? sriLankaHolidays[year] : undefined;
    if (official) {
      holidays.push(
        ...official.map(([day, name]) => ({ date: `${year}-${day}`, name })),
      );
      continue;
    }
    for (const holiday of calendar.getHolidays(year, "en")) {
      if (holiday.type === "public")
        holidays.push({ date: holiday.date.slice(0, 10), name: holiday.name });
    }
  }
  return holidays;
}
