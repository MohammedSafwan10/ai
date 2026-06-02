export async function transpileSnippet(sourceCode, language) {
  const { transform } = await import("sucrase");
  const transforms = [];
  if (language === "typescript" || language === "tsx") transforms.push("typescript");
  if (language === "jsx" || language === "tsx") transforms.push("jsx");

  try {
    const result = transform(sourceCode, {
      transforms,
      jsxPragma: "React.createElement",
      jsxFragmentPragma: "React.Fragment",
      production: true,
    });
    return { code: result.code, diagnostics: [] };
  } catch (error) {
    return {
      code: "",
      diagnostics: [{
        category: "error",
        message: error instanceof Error ? error.message : "Unable to transpile this snippet.",
      }],
    };
  }
}
