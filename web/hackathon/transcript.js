const criteria = [['technical', 'Technical difficulty', .30], ['originality', 'Originality', .25], ['ai_centrality', 'AI centrality', .30], ['taste', 'Taste', .15]];
const breakdown = score => criteria.map(([key, label]) => `${label}: ${score[key].toFixed(2)}/10`).join(' · ');

export function transcript(match) {
  const lines = ['ASTRA HOUSE — FINAL TRANSCRIPT', match.theme,
    `Mode: ${match.mode === 'demo' ? 'Scripted demo' : `Live (${match.model})`} · Match: ${match.id}`,
    'All participants and judging opinions are simulated.', '',
    'SCORING',
    'Final score /100 = 10 × (Technical × 30% + Originality × 25% + AI centrality × 30% + Taste × 15%), averaged equally across judgers.',
    'Ties are resolved by technical difficulty, then originality, then AI centrality. Remaining ties share a rank.', ''];
  for (const person of match.people) {
    const result = match.leaderboard.find(row => row.id === person.id);
    lines.push(`${person.name} — ${result ? `Rank ${result.rank} · ${result.score.toFixed(2)}/100` : 'Unranked — no submission'}`);
    lines.push(`Submitted idea: ${person.submission?.summary || 'No idea submitted before the final bell.'}`);
    if(person.submission?.deck_url) lines.push(`Deck & app demo: ${new URL(person.submission.deck_url, location.origin).href}`);
    for(const slide of person.submission?.deck||[]) lines.push(`Slide: ${slide.title}`, slide.body);
    if (result) lines.push(`Mean scores: ${breakdown(result)}`);
    for (const judge of match.judges) {
      const score = match.cards.find(card => card.judge_id === judge.id)?.scores.find(s => s.project_id === person.id);
      lines.push(`  Judger: ${judge.name}`);
      if (!score) { lines.push('  Not scored: no eligible submission.'); continue; }
      const total = 10 * criteria.reduce((sum, [key, , weight]) => sum + score[key] * weight, 0);
      lines.push(`  ${breakdown(score)} · Weighted score: ${total.toFixed(2)}/100`, `  Rationale: ${score.verdict}`);
      for (const id of score.evidence_ids) {
        const artifact = person.submission?.artifacts.find(a => a.id === id);
        lines.push(`  Evidence ${id}: ${artifact ? `${artifact.title} — ${artifact.content}` : 'See round record below.'}`);
      }
    }
    lines.push('');
  }
  lines.push('ROUND-BY-ROUND RECORD');
  for (let round = 1; round <= (match.round_limit||10); round++) {
    lines.push('', `ROUND ${round}`);
    for (const person of match.people) {
      const event = match.events.find(e => e.round === round && e.actor === person.id);
      lines.push(`${person.name} — ${event?.action || 'No recorded action'}`, event?.text || '');
      lines.push(`Decision summary: ${event?.decision_summary || 'Not recorded for this turn.'}`);
      if (event?.state) lines.push(`State: ${event.state.goal} · ${event.state.artifact_count} artifacts · ${event.state.memory_count} memories · Submission: ${event.state.submission_round ?? 'None'}`);
      const artifact = person.artifacts.find(a => a.round === round);
      if (artifact) lines.push(`${artifact.title}: ${artifact.content}`);
    }
  }
  return lines.join('\n');
}
