/**
 * async 控制器包装器
 * - 自动捕获 Promise rejection, 转发给 next(err)
 * - 避免每个控制器手写 try/catch
 *
 * 用法:
 *   router.get('/x', wrapAsync(async (req, res) => { ... }))
 *
 * @param {(req: import('express').Request, res: import('express').Response, next: import('express').NextFunction) => Promise<any>} fn
 */
const wrapAsync = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

module.exports = wrapAsync;
