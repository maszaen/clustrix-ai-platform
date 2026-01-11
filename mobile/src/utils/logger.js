export const log = (context, level, fn, msg, details) => {
  if (!__DEV__) return;
  const prefix = `[${context}] ${level} ${fn}: ${msg}`;
  if (details !== undefined) {
    // Keep details as a separate arg for easier inspection in devtools.
    console.log(prefix, details);
    return;
  }
  console.log(prefix);
};
