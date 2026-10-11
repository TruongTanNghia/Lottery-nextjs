export async function resolve(spec, ctx, next) {
  if (/^\.{1,2}\//.test(spec) && !/\.[mc]?[jt]s$/.test(spec)) {
    try {
      return await next(spec + ".ts", ctx);
    } catch {
      /* không có file .ts — để node tự tìm như thường */
    }
  }
  return next(spec, ctx);
}
