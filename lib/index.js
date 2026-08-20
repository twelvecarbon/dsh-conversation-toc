/**
 * dsh-conversation-toc — HOST half.
 *
 * 对话大纲功能完全在浏览器端（lib/client.js）实现：它读取会话 store
 * （useSession 的 chat.order / chat.nodes）并复用核心渲染出的 DOM 锚点
 * （[data-chat-anchor-key] / [data-conversation-scroll]），不需要任何宿主服务。
 *
 * 本文件只提供一个空的宿主插件行，让包能以标准 bundle 插件的形式挂载到 DSH
 * profile：
 *   1. `dsh plugin --profile web add dsh-conversation-toc` 能识别本包的
 *      `dsh.bundle.patch` 声明并把它写入 profile 的 bundles 层；
 *   2. 客户端 bundle（package.json 的 `dsh.client` 声明）随 boot 图加载，
 *      注册到 `conversation.session.header.utilities` 槽位。
 *
 * The whole feature runs in the browser half; this host row exists only so the
 * package mounts as a standard DSH bundle plugin (client bundle discovery keys
 * off live loader entries).
 */
export default {
  inject: [],
  apply() {
    // 纯客户端功能，无需宿主服务。
  }
}
