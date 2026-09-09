/**
 * 入参校验中间件 (基于 zod)
 * - 校验 req.body / req.query / req.params
 * - 失败抛 422 ApiError (由 error 中间件统一响应)
 * - 通过后将 req[key] 替换为校验后的数据 (含默认值处理)
 *
 * 用法:
 *   router.post('/',
 *     validate({ body: registerSchema }),
 *     controller.register
 *   );
 *
 * @param {{body?: any, query?: any, params?: any}} schemas - zod schema 映射
 */
const ApiError = require('../utils/ApiError');

function validate(schemas = {}) {
  return (req, _res, next) => {
    try {
      ['body', 'query', 'params'].forEach((key) => {
        if (schemas[key]) {
          const result = schemas[key].safeParse(req[key]);
          if (!result.success) {
            // 取第一条错误信息, 避免暴露内部结构
            const first = result.error.issues[0];
            const field = first.path.join('.') || '输入';
            throw ApiError.unprocessable('VALIDATION_FAILED', `${field}: ${first.message}`);
          }
          // 替换为经过校验/默认值处理后的数据
          req[key] = result.data;
        }
      });
      next();
    } catch (err) {
      next(err);
    }
  };
}

module.exports = validate;
