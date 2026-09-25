# City time and weather

Open Settings and account, then click the city name to choose a major city. A single row shows its weather icon, name, local time and temperature. Click the temperature to toggle Celsius/Fahrenheit; click the sync icon to follow or stop following its time and weather. Only city search expands inline. Syncing continues when settings are closed.

City search includes populated places with at least 100,000 residents and national capitals. State/region records and small towns are excluded. The selected city, temperature unit and sync setting are stored together in the rider’s database profile (`road_profiles.city_preferences`). Signed-in riders get the same settings on every device; guests keep them through their guest session cookie. Other open devices receive updates through the room refresh (every 15 seconds, and on reconnect/focus).

The sync control follows the city's day/night conditions, cloud cover, fog, rain, snow and thunderstorms across the chosen landscape. It also updates wet windows and weather audio. Tunnels stay sheltered. The landscapes are fictional; selecting a city does not reconstruct its geography.

The row and station clocks use the city's IANA timezone, including daylight saving time. Station clocks switch immediately when the city or sync setting changes; disabling sync restores the browser's local time. Clock syncing remains available even during a weather outage. Weather refreshes every five minutes while the panel is open or syncing is enabled. Readings over an hour old, or missing weather/daylight information, suspend syncing and restore the journey's atmosphere until fresh data arrives. Refresh failures retain the last temperature and offer a compact retry action.

Sources:

- [Open-Meteo geocoding](https://open-meteo.com/en/docs/geocoding-api) supplies city coordinates, population and timezones from GeoNames. This is the same underlying city source used by [joelacus/world-cities](https://github.com/joelacus/world-cities); no static city list is bundled.
- [Open-Meteo forecast API](https://open-meteo.com/en/docs) supplies model-based current conditions. Requests use explicit Celsius/km/h units and UTC epoch timestamps to avoid double-applying timezone offsets.

The same-origin `/api/cities` and `/api/weather` handlers validate parameters, set eight-second upstream timeouts and cache city lookups for a day and weather for five minutes. No API key is needed for the public Open-Meteo endpoint. Attribution links are included in the panel.

Existing browser-only city settings are imported once, only when the database profile has no saved city preferences. Existing account settings take precedence over a guest profile on sign-in; a new account inherits its guest’s preferences. Signing out starts with the new guest profile’s defaults. A failed save leaves a retry action beside the row. Rapid changes are serialized, and saves are bound to a profile ID to prevent a pending request from changing a different signed-in rider.

The SQLite and PostgreSQL store initialization adds the nullable `city_preferences` column automatically without changing existing mileage, intentions or gardens. City preferences are included only in the current rider’s profile response, never in the public leaderboard.
