// Consolidated browser-feedback improvements, loaded after the base workflow layer.
const reviewEsc = (s) => esc(s ?? "");
const reviewProjects = async () => (await api("/projects")).projects || [];
const reviewGeo = (location) => {
  const s = String(location || "").toLowerCase();
  const cities = [
    ["regensburg", 49.013, 12.102],
    ["nuremberg", 49.452, 11.077],
    ["munich", 48.137, 11.576],
    ["münchen", 48.137, 11.576],
    ["vienna", 48.208, 16.373],
    ["eindhoven", 51.441, 5.469],
    ["prague", 50.075, 14.438],
    ["lyon", 45.764, 4.835],
    ["cairo", 30.044, 31.236],
    ["dubai", 25.205, 55.271],
    ["dresden", 51.05, 13.738],
    ["barcelona", 41.387, 2.168],
    ["amman", 31.953, 35.91],
    ["turin", 45.07, 7.687],
    ["istanbul", 41.008, 28.978],
    ["berlin", 52.52, 13.405],
    ["hamburg", 53.551, 9.993],
    ["frankfurt", 50.11, 8.682],
    ["stuttgart", 48.775, 9.182],
    ["warsaw", 52.23, 21.012],
    ["milan", 45.464, 9.19],
    ["paris", 48.857, 2.352],
    ["london", 51.507, -0.128],
    ["amsterdam", 52.368, 4.904],
    ["stockholm", 59.329, 18.069],
    ["zurich", 47.377, 8.541],
    ["czech", 49.8, 15.5],
    ["germany", 51.2, 10.4],
    ["austria", 47.6, 14.1],
    ["netherlands", 52.2, 5.3],
    ["france", 46.2, 2.2],
    ["egypt", 26.8, 30.8],
    ["uae", 24.2, 54.4],
    ["jordan", 31.2, 36.2],
    ["italy", 42.8, 12.6],
    ["spain", 40.4, -3.7],
    ["turkiye", 39, 35],
  ];
  const found = cities.find(([k]) => s.includes(k));
  return found ? [found[1], found[2]] : [50.8, 10.2];
};
function reviewTokens(s) {
  return String(s || "")
    .toLocaleLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}
function reviewScore(s, query) {
  const fields = [
      s.company,
      s.location,
      ...(s.services || []),
      ...(s.serviceCatalog || []).map((x) => x.name + " " + x.category),
      ...(s.certifications || []),
      ...(s.teamMembers || []).flatMap((x) => [x.name, x.role, x.certifications]),
      s.description,
    ].map((x) => String(x || "").toLowerCase()),
    joined = fields.join(" "),
    tokens = reviewTokens(query);
  if (!tokens.length) return 0;
  let score = 0;
  for (const token of tokens) {
    const exact = fields.some((x) => reviewTokens(x).includes(token));
    if (exact) score += 5;
    else if (joined.includes(token)) score += 3;
    else {
      let best = 0;
      for (const word of joined.split(/[^a-z0-9]+/)) {
        if (Math.min(token.length, word.length) < 4) continue;
        let common = 0;
        for (let i = 0; i < token.length - 1; i++) if (word.includes(token.slice(i, i + 2))) common++;
        best = Math.max(best, common / Math.max(token.length - 1, 1));
      }
      score += best > 0.55 ? 1 : 0;
    }
  }
  return score;
}
function reviewQuery() {
  return new URLSearchParams(location.hash.split("?")[1] || "");
}
