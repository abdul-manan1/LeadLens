// Generates public/samples/saasquatch_style_export.csv: a synthetic lead list
// shaped like a SaaSquatch Leads export, with deliberately messy values
// (mixed revenue formats, employee ranges, duplicates, blanks) to exercise the
// column mapper, normalizer, deduper and scorer. All companies are fictional.
import fs from "node:fs";
import path from "node:path";

const industries = ["HVAC", "Plumbing", "Landscaping", "Commercial Cleaning", "Precision Machining", "Roofing", "Pest Control", "Dental Practice", "IT Services", "Trucking & Logistics", "Accounting", "Software", "Wholesale Distribution", "Electrical Contractor", "Auto Repair"];
const cities = [["Dallas", "TX"], ["Columbus", "OH"], ["Phoenix", "AZ"], ["Tampa", "FL"], ["Nashville", "TN"], ["Denver", "CO"], ["Charlotte", "NC"], ["Milwaukee", "WI"], ["Grand Rapids", "MI"], ["Boise", "ID"], ["Tucson", "AZ"], ["Raleigh", "NC"]];
const first = ["Maria", "James", "Linda", "Robert", "Patricia", "Michael", "Barbara", "David", "Susan", "Richard", "Karen", "Joseph", "Nancy", "Thomas", "Lisa", "Daniel"];
const last = ["Alvarez", "Kowalski", "Nguyen", "Bennett", "Okafor", "Fischer", "Delgado", "Murphy", "Patel", "Hansen", "Romero", "Carter", "Schmidt", "Brooks", "Reyes", "Foster"];
const nouns = ["Summit", "Pioneer", "Blue Ridge", "Ironwood", "Lakeside", "Northstar", "Cardinal", "Granite", "Prairie", "Harbor", "Redwood", "Keystone", "Silverline", "Copper Creek", "Oakmont", "Frontier", "Heritage", "Evergreen", "Beacon", "Meridian"];

let seed = 42;
const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
const pick = (a) => a[Math.floor(rnd() * a.length)];

const revFormats = [
  (n) => `$${(n / 1e6).toFixed(1)}M`,
  (n) => `${Math.round(n).toLocaleString("en-US")}`,
  (n) => `$${Math.round(n / 1e3)}K`,
  (n) => `${(n / 1e6).toFixed(0)}M-${((n / 1e6) * 1.6).toFixed(0)}M`,
  () => "",
];
const empFormats = [(n) => `${n}`, (n) => `${Math.max(1, n - 5)}-${n + 10}`, (n) => `${n}+`, () => ""];

const rows = [];
const header = ["Company", "Website", "Industry", "City", "State", "Country", "Employee Count", "Estimated Revenue", "Revenue Confidence", "BBB Rating", "Owner Name", "Owner Title", "Email", "Phone", "LinkedIn URL"];

for (let i = 0; i < 38; i++) {
  const ind = pick(industries);
  const [city, state] = pick(cities);
  const name = `${pick(nouns)} ${ind.split(" ")[0]} ${pick(["Co.", "Inc", "LLC", "Services", "Group", ""])}`.trim();
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 24);
  const domain = `${slug}.example.com`;
  const employees = Math.round(3 + rnd() * rnd() * 220);
  const revenue = employees * (90_000 + rnd() * 160_000);
  const owner = rnd() < 0.7 ? `${pick(first)} ${pick(last)}` : "";
  const email = owner && rnd() < 0.7 ? `${owner.split(" ")[0].toLowerCase()}@${domain}` : rnd() < 0.5 ? `info@${domain}` : "";
  const phone = rnd() < 0.75 ? `(${pick(["214", "614", "602", "813", "615", "303", "704", "414", "616", "208"])}) ${String(200 + Math.floor(rnd() * 700))}-${String(1000 + Math.floor(rnd() * 9000))}` : "";
  rows.push([
    rnd() < 0.15 ? name.toUpperCase() : name,
    rnd() < 0.1 ? "" : rnd() < 0.5 ? `https://www.${domain}` : domain,
    ind,
    city,
    state,
    "United States",
    pick(empFormats)(employees),
    pick(revFormats)(revenue),
    pick(["High", "Medium", "Low"]),
    pick(["A+", "A", "A-", "B", "NR", ""]),
    owner,
    owner ? pick(["Owner", "President", "Founder", "CEO", "Owner/Operator"]) : "",
    email,
    phone,
    rnd() < 0.4 ? `https://www.linkedin.com/company/${slug}` : "",
  ]);
}

// Deliberate duplicates: same domain with different casing/URL form, and same name + city without a website.
const d1 = rows[3];
rows.push([d1[0] + " ", `HTTP://WWW.${d1[1].replace(/^https?:\/\/(www\.)?/, "").toUpperCase()}/`, d1[2], d1[3], d1[4], "USA", "", "", "", "", "", "", "", "", ""]);
const d2 = rows[7];
rows.push([d2[0].replace(/\b(Inc|LLC|Co\.)\b/, "").trim(), "", d2[2], d2[3], d2[4], "United States", d2[6], d2[7], "", "", d2[10], "", "", d2[13], ""]);

const csv = [header, ...rows].map((r) => r.map((v) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)).join(",")).join("\r\n") + "\r\n";
const out = path.join(process.cwd(), "public", "samples", "saasquatch_style_export.csv");
fs.writeFileSync(out, csv);
console.log(`Wrote ${rows.length} rows to ${out}`);
