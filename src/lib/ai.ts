import Anthropic from "@anthropic-ai/sdk";
import type { Lead } from "./types";

/**
 * Personalized outreach opener for a searcher contacting an owner.
 * Uses Claude when ANTHROPIC_API_KEY is configured; otherwise falls back to a
 * deterministic template built from the same enrichment facts, so the feature
 * always works offline and in demos.
 */
function facts(lead: Lead): string[] {
  const e = lead.enrichment;
  const out: string[] = [];
  if (e?.foundedYear) out.push(`in business since ${e.foundedYear}`);
  else if (e?.domainAgeYears && e.domainAgeYears >= 8) out.push(`online for ${Math.round(e.domainAgeYears)}+ years`);
  if (lead.location) out.push(`based in ${lead.location}`);
  if (lead.industry) out.push(`operating in ${lead.industry.toLowerCase()}`);
  if (lead.employees) out.push(`a team of roughly ${lead.employees}`);
  if (e?.hasCareersPage) out.push("actively hiring");
  if (e?.description) out.push(`described as "${e.description.slice(0, 120)}"`);
  return out;
}

export function templateOpener(lead: Lead): string {
  const owner = lead.ownerName ?? lead.enrichment?.ownerHints[0] ?? null;
  const greeting = owner ? `Hi ${owner.split(" ")[0]},` : "Hello,";
  const f = facts(lead);
  const hook = f.length
    ? `I came across ${lead.company} while researching ${lead.industry ? lead.industry.toLowerCase() + " businesses" : "established companies"}${lead.location ? ` in ${lead.location}` : ""}, and was impressed that you've been ${f[0]}.`
    : `I came across ${lead.company} while researching established owner-operated businesses.`;
  return `${greeting}\n\n${hook} I'm an acquisition entrepreneur looking to buy and personally run one great company for the long term, not flip it.\n\nIf you've ever thought about what a transition might look like on your own timeline, I'd welcome a 15-minute conversation. No brokers, no pressure.\n\nBest regards,\n[Your name]`;
}

export async function generateOpener(lead: Lead): Promise<{ text: string; source: "claude" | "template" }> {
  if (!process.env.ANTHROPIC_API_KEY) return { text: templateOpener(lead), source: "template" };

  const client = new Anthropic();
  const e = lead.enrichment;
  const context = [
    `Company: ${lead.company}`,
    lead.website ? `Website: ${lead.website}` : null,
    lead.industry ? `Industry: ${lead.industry}` : null,
    lead.location ? `Location: ${lead.location}` : null,
    lead.ownerName ? `Owner: ${lead.ownerName}` : e?.ownerHints[0] ? `Likely owner (from website): ${e.ownerHints[0]}` : null,
    lead.employees ? `Employees: ${lead.employees}` : null,
    e?.foundedYear ? `Founded: ${e.foundedYear}` : null,
    e?.description ? `Site description: ${e.description}` : null,
    e?.hasCareersPage ? "Signal: has a careers page (hiring)" : null,
    e?.techSignals.length ? `Tech signals: ${e.techSignals.join(", ")}` : null,
    lead.scoreBreakdown ? `Acquisition-fit score: ${lead.scoreBreakdown.score}/100` : null,
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const response = await client.messages.create({
      model: "claude-opus-5",
      max_tokens: 1024,
      output_config: { effort: "low" },
      system:
        "You write short, warm, specific cold-outreach emails from an acquisition entrepreneur (a searcher who wants to buy and run one small business long-term) to a business owner. Rules: 90-130 words, plain text, no subject line, no placeholders except [Your name] at the end, reference one or two concrete facts from the context, never invent facts, never sound like a broker or private-equity firm, end with a low-pressure ask for a 15-minute call.",
      messages: [{ role: "user", content: `Write the email using only these facts:\n\n${context}` }],
    });
    if (response.stop_reason === "refusal") return { text: templateOpener(lead), source: "template" };
    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();
    return text ? { text, source: "claude" } : { text: templateOpener(lead), source: "template" };
  } catch {
    return { text: templateOpener(lead), source: "template" };
  }
}
