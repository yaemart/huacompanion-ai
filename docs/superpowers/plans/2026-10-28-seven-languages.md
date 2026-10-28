# Seven-language implementation plan

Goal: extend both website and service-language choices to zh, en, es, fr, de, it, ar as explicitly requested.

Architecture: one locale registry; explicit translated interface strings; locale-specific CMS records remain independent and reviewable. Missing published translations show localized empty states, never disguised English content. Arabic uses RTL. Existing provider capabilities are not expanded automatically.

1. Add shared Locale registry, route switching, HTML language/direction, seven-option header and localized metadata.
2. Extend content/intake validation, Payload selects, workbench, public APIs, Agent locale handling and migration enums. Preserve published-data filtering and permissions.
3. Translate public content/catalog UI and request/application forms into five new languages. Keep Chinese admin UI, support managing seven content locales.
4. Test accepted/rejected locales, route/query preservation, translation coverage and Arabic direction; run unit/type/build checks and local HTTP smoke tests.
5. Apply local schema update, restart local app, report what is translated and what remains unpublished.

Verification focus: unsupported language codes; unpublished translations; actual service language distinct from page language; URL source and query preservation; Arabic input/readability; enum migration compatibility.
