/* GDPR self-service (T120–T121). The "Your data" panel and account deletion on the profile page are in
   areas/profile.js (T135a); the pending deletions for admins in areas/admin.js (T134a). */
// Signing in during the grace period cancelled the deletion: say so.
const gdBaseApi = api;
api = async function (path, opts = {}) {
  const result = await gdBaseApi(path, opts);
  if (path === "/auth/login" && result?.deletionCancelled) setTimeout(() => tToast(t("prof.del.cancelled")), 700);
  return result;
};
