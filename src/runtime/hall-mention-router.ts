import type { HallParticipant, MentionTarget } from "../types";

export interface HallMentionRoutingResult {
  broadcastAll: boolean;
  targets: MentionTarget[];
}

export function resolveHallMentionTargets(
  content: string,
  participants: HallParticipant[],
): HallMentionRoutingResult {
  const trimmed = content.trim();
  if (!trimmed) {
    return { broadcastAll: false, targets: [] };
  }

  const broadcastAll = /(^|[\s(])@all(?=$|[\s),.!?;:])/i.test(trimmed);
  const matched = new Map<string, MentionTarget>();

  // Sort participants by longest alias first so multi-word names
  // (e.g. "Coding Agent") match before their single-word substrings.
  const sorted = [...participants].sort((a, b) => {
    const aMax = Math.max(...a.aliases.map((alias) => alias.length));
    const bMax = Math.max(...b.aliases.map((alias) => alias.length));
    return bMax - aMax;
  });

  for (const participant of sorted) {
    if (matched.has(participant.participantId)) continue;
    for (const alias of participant.aliases) {
      if (!alias) continue;
      if (!containsExplicitMention(trimmed, alias)) continue;
      matched.set(participant.participantId, {
        raw: `@${alias}`,
        participantId: participant.participantId,
        displayName: participant.displayName,
        semanticRole: participant.semanticRole,
      });
      break;
    }
  }

  return {
    broadcastAll,
    targets: [...matched.values()],
  };
}

function containsExplicitMention(content: string, alias: string): boolean {
  const escaped = escapeRegex(alias);
  // For multi-word aliases (containing spaces), allow the @mention
  // to span across spaces in the content text.
  if (alias.includes(" ")) {
    const pattern = new RegExp(`(^|[\\s(])@${escaped}(?=$|[\\s),.!?;:])`, "i");
    return pattern.test(content);
  }
  const pattern = new RegExp(`(^|[\\s(])@${escaped}(?=$|[\\s),.!?;:])`, "i");
  return pattern.test(content);
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
