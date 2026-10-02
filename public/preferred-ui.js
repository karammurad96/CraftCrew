/* Preferred suppliers (T68): the customer's list, loaded for the pages that use it. The page, the profile button
   and the note dialog are in areas/directory.js (T129a); the bid form and invitations in areas/offers.js (T129b). */
let pvData = { suppliers: [], invites: [] };
const pvLoad = async () => (pvData = await api("/preferred-suppliers"));
