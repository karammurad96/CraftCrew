/* Two-factor sign-in (T67): the notices at sign-in and the admin requirement. The settings panel, setup and
   recovery codes are in areas/profile.js (T135a). */
const tfBaseApi = api;
api = async function (path, opts = {}) {
  try {
    const result = await tfBaseApi(path, opts);
    if (path === "/auth/login" && result?.recoveryCodesLeft !== undefined) setTimeout(() => tToast(t("prof.tf.recoveryUsed", { n: result.recoveryCodesLeft })), 600);
    return result;
  } catch (e) {
    if (e.code === "TOTP_SETUP_REQUIRED") tfRequireSetup();
    throw e;
  }
};

// Admins who must use two-factor sign-in land on their settings with the setup dialog open.
let tfRedirecting = false;
function tfRequireSetup() {
  if (tfRedirecting || !state.user) return;
  tfRedirecting = true;
  tToast(t("prof.tf.setupNeeded"));
  navigate(`/${state.user.role}/profile`);
  setTimeout(() => {
    tfRedirecting = false;
    tfSetup();
  }, 400);
}
