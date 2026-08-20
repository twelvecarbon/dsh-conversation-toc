/**
 * dsh-conversation-toc — CLIENT half.
 *
 * 在 DeepSeek Harness Web 的会话页右侧显示「对话大纲」（类似 DeepSeek 网页版
 * 右边栏的目录 / 位置指示器）：
 *
 *  - 主题列表（展开态）：用户提问为一级主题，steering 追问为缩进的二级主题，
 *    助手回答中的 ## / ### 小标题为三级主题；每行右侧带胶囊形指示条，
 *    当前主题蓝色高亮（其余浅灰）；
 *  - 滚动高亮（scroll-spy）：随会话滚动自动定位当前阅读位置；
 *  - 快捷跳转：点击任意主题，平滑滚动到对应消息位置；
 *  - 折叠胶囊条（minimap）：空间不足或手动折叠时，只保留右侧胶囊指示条，
 *    点击胶囊同样可跳转；**鼠标靠近胶囊条时自动展开主题气泡面板**，移开后收回；
 *  - 顶栏「大纲」按钮：循环切换 展开 → 胶囊条 → 隐藏，选择会记忆到 localStorage。
 *
 * 实现说明：
 *  - 数据来自会话 store：`useSession` 选择器读取 `chat.order` / `chat.nodes`，
 *    因此新消息、流式输出都会自动反映到大纲中；
 *  - DOM 锚点复用核心的 `[data-chat-anchor-key]`，滚动容器复用
 *    `[data-conversation-scroll]`，不依赖任何私有样式类；
 *  - 面板通过 createPortal 挂到 document.body，用 position:fixed 锚定在
 *    消息列右侧的留白处（与 DeepSeek 网页版一致）。
 */

window.__ModuleLoader__.load({
  id: "dsh-conversation-toc",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
    var React = require("react");
    var ReactDOM = require("react-dom");
    var el = React.createElement;
    var useState = React.useState;
    var useEffect = React.useEffect;
    var useRef = React.useRef;
    var useMemo = React.useMemo;
    var useCallback = React.useCallback;

    // ── constants ────────────────────────────────────────────────────────
    var STORAGE_KEY = "dsh-conversation-toc.mode.v1";
    var MAX_TOPICS = 200;                 // 大纲条目总数上限
    var MAX_HEADINGS_PER_STEP = 10;       // 单个助手步骤最多提取的小标题数
    var LABEL_MAX = 44;                   // 主题文案截断长度
    var EXPAND_MIN_ROOM = 200;            // 消息列右侧（中列内）留白 >= 此值才显示展开面板
    var READING_OFFSET = 110;             // 阅读参考线（滚动容器顶部偏移）
    var EMPTY_TOPICS = [];

    // ── theme tokens（跟随 DSH 明暗主题）────────────────────────────────
    var C = {
      primary: "var(--dsw-alias-state-business-primary)",
      labelPrimary: "var(--dsw-alias-label-primary)",
      labelSecondary: "var(--dsw-alias-label-secondary)",
      labelTertiary: "var(--dsw-alias-label-tertiary)",
      border1: "var(--dsw-alias-border-l1)",
      border2: "var(--dsw-alias-border-l2)",
      bgBase: "var(--dsw-alias-bg-base)",
      bgLayer1: "var(--dsw-alias-bg-layer-1)",
      hover: "var(--dsw-alias-interactive-bg-hover)",
      shadow2: "var(--dsw-shadow-lv2)"
    };
    // 激活态蓝色（与 usage 插件一致的品牌蓝，用于高亮/指示条）
    var BLUE = "rgba(90,140,255,1)";
    var BLUE_SOFT = "rgba(90,140,255,.14)";

    // 字号用 em 表示，随宿主「显示大小」设置的字体基准自动缩放。
    var BASE_FS = 13;
    var fs = function (n) { return (Math.round(n / BASE_FS * 100) / 100).toFixed(2) + "em"; };

    // 少量伪类样式（hover / focus），内联样式无法表达的部分
    var CSS = [
      "[data-dsh-toc-row]{transition:background .12s ease,color .12s ease}",
      "[data-dsh-toc-row]:hover{background:" + C.hover + "}",
      "[data-dsh-toc-row]:focus-visible{outline:2px solid " + BLUE + ";outline-offset:-2px}",
      "[data-dsh-toc-capsule]:hover{transform:scaleY(1.3)}",
      "[data-dsh-toc-capsule]{transition:background .12s ease,transform .12s ease}",
      ".dsh-toc-panel{animation:dshTocFade .14s ease}",
      "@keyframes dshTocFade{from{opacity:0}to{opacity:1}}"
    ].join("\n");

    // ── storage helpers ──────────────────────────────────────────────────
    function loadMode() {
      try {
        var v = localStorage.getItem(STORAGE_KEY);
        if (v === "expanded" || v === "rail" || v === "hidden") return v;
      } catch (e) {}
      return "expanded";
    }
    function saveMode(m) {
      try { localStorage.setItem(STORAGE_KEY, m); } catch (e) {}
    }

    // ── text helpers ─────────────────────────────────────────────────────
    // 从消息内容（content / blocks 数组）中提取纯文本
    function textOfContent(content) {
      if (content == null) return "";
      if (typeof content === "string") return content;
      if (!Array.isArray(content)) return "";
      var parts = [];
      for (var i = 0; i < content.length; i++) {
        var item = content[i];
        if (item == null) continue;
        if (typeof item === "string") { parts.push(item); continue; }
        if (item.type === "text" && typeof item.text === "string") parts.push(item.text);
        else if (item.type === "heading" && typeof item.text === "string") parts.push(item.text);
        else if (item.type === "paragraph" && Array.isArray(item.children)) {
          var sub = textOfContent(item.children);
          if (sub) parts.push(sub);
        }
      }
      return parts.join("\n");
    }

    // 清洗一行：去掉 markdown 标题/引用/列表/强调/链接语法
    function cleanLine(line) {
      return String(line || "")
        .replace(/^#{1,6}\s*/, "")
        .replace(/^>\s?/, "")
        .replace(/^\s*[-*+]\s+/, "")
        .replace(/^\s*\d+[.)]\s+/, "")
        .replace(/[*_~`]/g, "")
        .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
        .trim();
    }

    // 取内容的第一段非空文本
    function firstLine(text) {
      var lines = String(text || "").split(/\r?\n/);
      for (var i = 0; i < lines.length; i++) {
        var l = cleanLine(lines[i]);
        if (l) return l;
      }
      return "";
    }

    function truncate(s, n) {
      s = String(s || "");
      if (s.length <= n) return s;
      return s.slice(0, n - 1) + "…";
    }

    // ── topic building ───────────────────────────────────────────────────
    // 从会话 store 构建大纲条目：
    //   user           → 一级（提问）
    //   steering       → 二级（追问 / 子任务，缩进显示）
    //   assistant-step → 三级（回答中的 ## / ### 小标题，最多 MAX_HEADINGS_PER_STEP）
    // 每个条目携带 nodeKey（对应 DOM 的 [data-chat-anchor-key]）用于跳转/高亮；
    // key 仅作为 React 列表键（小标题条目用 nodeKey + 行号保证唯一）。
    function buildTopics(order, nodes) {
      var out = [];
      if (!order || !nodes) return out;
      for (var i = 0; i < order.length && out.length < MAX_TOPICS; i++) {
        var key = order[i];
        var node = nodes && typeof nodes.get === "function" ? nodes.get(key) : nodes[key];
        if (!node || !node.kind || !node.key) continue;
        var data = node.data || {};
        if (node.kind === "user" || node.kind === "steering") {
          var text = textOfContent(data.content);
          var label = truncate(firstLine(text), LABEL_MAX);
          if (label) {
            out.push({ key: node.key, nodeKey: node.key, level: node.kind === "user" ? 0 : 1, kind: node.kind, label: label, node: node });
          }
        } else if (node.kind === "assistant-step") {
          var blocks = data.blocks || data.content;
          var text2 = textOfContent(blocks);
          var lines = String(text2 || "").split(/\r?\n/);
          var added = 0;
          var lastHeading = "";
          for (var j = 0; j < lines.length && added < MAX_HEADINGS_PER_STEP; j++) {
            var m = /^(#{2,3})\s+(.+)$/.exec(lines[j]);
            if (!m) continue;
            var h = truncate(cleanLine(m[2]), LABEL_MAX);
            if (!h || h === lastHeading) continue;
            lastHeading = h;
            out.push({ key: node.key + "#h" + j, nodeKey: node.key, level: 2, kind: "heading", label: h, node: node });
            added++;
          }
        }
      }
      return out;
    }

    // useSession 选择器的相等比较：仅当条目集合真的变化时才触发重渲染
    function sameTopics(a, b) {
      if (a === b) return true;
      if (!a || !b || a.length !== b.length) return false;
      for (var i = 0; i < a.length; i++) {
        var x = a[i], y = b[i];
        if (x.key !== y.key || x.nodeKey !== y.nodeKey || x.level !== y.level ||
          x.kind !== y.kind || x.label !== y.label) return false;
      }
      return true;
    }

    // 当前可见的会话滚动容器（一次只挂载一个活动会话）
    function findScrollport() {
      var all = document.querySelectorAll("[data-conversation-scroll]");
      for (var i = 0; i < all.length; i++) {
        var r = all[i].getBoundingClientRect();
        if (r.width > 40 && r.height > 40 && r.bottom > 0 && r.top < window.innerHeight) return all[i];
      }
      return all[0] || null;
    }

    // 判断主题是否为「当前定位主题」：
    //   1. activeKey 必须命中该主题所在的消息节点（topic.nodeKey）；
    //   2. 该主题必须是此节点下的最后一个主题（同一节点有多个小标题时，只高亮最后一个）。
    function isTopicActive(activeKey, topic, lastPerNode) {
      return activeKey !== null && activeKey === topic.nodeKey && lastPerNode[topic.nodeKey] === topic.key;
    }

    // ── sub-components ───────────────────────────────────────────────────
    function TocToggleButton(props) {
      var mode = props.mode, count = props.count, onClick = props.onClick;
      var active = mode !== "hidden";
      return el("button", {
        type: "button",
        title: "对话大纲" + (count > 0 ? "（" + count + " 个主题，点击切换 展开/胶囊条/隐藏）" : "（暂无主题）"),
        "aria-label": "对话大纲",
        "aria-pressed": active,
        onClick: onClick,
        style: {
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          height: 28,
          padding: "0 10px",
          border: "1px solid " + (active ? "rgba(90,140,255,.5)" : C.border2),
          background: active ? BLUE_SOFT : "transparent",
          color: active ? BLUE : C.labelSecondary,
          borderRadius: 999,
          cursor: "pointer",
          fontFamily: "var(--dsw-font-family, inherit)",
          fontSize: fs(13),
          lineHeight: "20px",
          whiteSpace: "nowrap",
          flex: "none"
        }
      },
        el("svg", {
          viewBox: "0 0 16 16", width: 14, height: 14,
          fill: "none", stroke: "currentColor", strokeWidth: 1.5,
          strokeLinecap: "round", "aria-hidden": true
        },
          el("path", { d: "M2.5 4h11M2.5 8h11M2.5 12h11" })
        ),
        el("span", null, "大纲"),
        count > 0 ? el("span", { style: { fontSize: fs(10), opacity: 0.72 } }, String(count)) : null
      );
    }

    // 行样式（贴近网页版）：
    //   active → 蓝色字体 + 蓝色指示条（仅当前定位主题）
    //   hover  → 字体加深为近黑色（主题主色），指示条加深为深灰
    //   其它   → 浅灰色字体 + 浅灰指示条
    function rowStyle(level, active, hover) {
      return {
        display: "flex",
        alignItems: "center",
        gap: 8,
        paddingTop: 5,
        paddingBottom: 5,
        paddingLeft: 10 + level * 14,
        paddingRight: 10,
        borderRadius: 7,
        cursor: "pointer",
        fontSize: fs(level === 0 ? 12.5 : level === 1 ? 12 : 11.5),
        lineHeight: "18px",
        color: active ? BLUE : (hover ? C.labelPrimary : C.labelTertiary),
        fontWeight: active ? 600 : 400,
        background: "transparent"
      };
    }

    function barStyle(active, hover, kind) {
      return {
        flex: "none",
        width: kind === "user" ? 14 : 10,
        height: 3,
        borderRadius: 2,
        background: active ? BLUE : (hover ? C.labelSecondary : C.border2)
      };
    }

    function TocPanel(props) {
      var topics = props.topics, activeKey = props.activeKey, lastPerNode = props.lastPerNode,
        onJump = props.onJump, onHide = props.onHide, style = props.style;
      var [hoverKey, setHoverKey] = useState(null);
      return el("div", { className: "dsh-toc-panel", style: style },
        el("div", {
          style: {
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "10px 12px 8px",
            borderBottom: "1px solid " + C.border1,
            flex: "none"
          }
        },
          el("span", { style: { fontSize: fs(12), fontWeight: 600, color: C.labelPrimary, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: "1 1 auto" } }, "对话大纲"),
          el("span", { style: { fontSize: fs(10), color: C.labelTertiary, flex: "none" } }, topics.length + " 个主题"),
          el("button", {
            type: "button",
            title: "隐藏大纲（可在顶栏「大纲」按钮重新打开）",
            "aria-label": "隐藏大纲",
            onClick: onHide,
            style: {
              flex: "none",
              width: 22, height: 22,
              display: "grid", placeItems: "center",
              border: 0, background: "transparent",
              color: C.labelTertiary, cursor: "pointer",
              borderRadius: 999, fontSize: fs(14), lineHeight: 1
            }
          }, "×")
        ),
        el("div", {
          style: {
            flex: "1 1 auto",
            minHeight: 0,
            overflowY: "auto",
            padding: "6px 8px 8px",
            display: "flex",
            flexDirection: "column",
            gap: 2
          }
        },
          topics.map(function (topic) {
            // 同一消息节点下的多个小标题：只有最后一个随节点高亮
            var active = isTopicActive(activeKey, topic, lastPerNode);
            var hover = hoverKey === topic.key;
            return el("div", {
              key: topic.key,
              "data-dsh-toc-row": "",
              role: "button",
              tabIndex: 0,
              title: topic.label,
              onClick: function () { onJump(topic.nodeKey); },
              onMouseEnter: function () { setHoverKey(topic.key); },
              onMouseLeave: function () { setHoverKey(null); },
              onKeyDown: function (e) {
                if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onJump(topic.nodeKey); }
              },
              style: rowStyle(topic.level, active, hover)
            },
              el("span", {
                style: {
                  flex: "1 1 auto", minWidth: 0,
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap"
                }
              }, topic.label),
              el("span", { "data-kind": topic.kind, style: barStyle(active, hover, topic.kind) })
            );
          })
        )
      );
    }

    function TocRail(props) {
      var topics = props.topics, activeKey = props.activeKey, lastPerNode = props.lastPerNode,
        onJump = props.onJump, style = props.style;
      // 胶囊条只展示问题级主题（user / steering），与 DeepSeek 网页版的位置指示一致
      var railTopics = [];
      for (var i = 0; i < topics.length; i++) {
        if (topics[i].level <= 1) railTopics.push(topics[i]);
      }
      return el("div", { style: style, role: "navigation", "aria-label": "对话大纲（位置指示）" },
        railTopics.map(function (topic) {
          var active = isTopicActive(activeKey, topic, lastPerNode);
          return el("div", {
            key: topic.key,
            "data-dsh-toc-capsule": "",
            title: topic.label,
            onClick: function () { onJump(topic.nodeKey); },
            style: {
              width: 14,
              height: 4,
              borderRadius: 2,
              cursor: "pointer",
              background: active ? BLUE : C.border2
            }
          });
        })
      );
    }

    /**
     * 悬停展开的主题气泡：鼠标靠近胶囊条时，在胶囊条左侧展开显示历史对话主题列表，
     * 鼠标移开后自动收回。行样式与展开面板一致。
     */
    function TocHoverPanel(props) {
      var topics = props.topics, activeKey = props.activeKey, lastPerNode = props.lastPerNode, onJump = props.onJump;
      var [hoverKey, setHoverKey] = useState(null);
      return el("div", {
        style: {
          background: C.bgBase,
          border: "1px solid " + C.border1,
          borderRadius: 10,
          boxShadow: C.shadow2,
          width: 224,
          maxHeight: "min(440px, calc(100vh - 160px))",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          fontFamily: "var(--dsw-font-family, inherit)",
          color: C.labelPrimary
        }
      },
        el("div", {
          style: {
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "8px 10px 6px",
            borderBottom: "1px solid " + C.border1,
            flex: "none"
          }
        },
          el("span", { style: { fontSize: fs(11), fontWeight: 600, color: C.labelPrimary, flex: "1 1 auto", minWidth: 0 } }, "对话大纲"),
          el("span", { style: { fontSize: fs(10), color: C.labelTertiary, flex: "none" } }, topics.length + " 个主题")
        ),
        el("div", {
          style: {
            flex: "1 1 auto",
            minHeight: 0,
            overflowY: "auto",
            padding: "6px 8px 8px",
            display: "flex",
            flexDirection: "column",
            gap: 2
          }
        },
          topics.map(function (topic) {
            var active = isTopicActive(activeKey, topic, lastPerNode);
            var hover = hoverKey === topic.key;
            return el("div", {
              key: topic.key,
              "data-dsh-toc-row": "",
              role: "button",
              tabIndex: 0,
              title: topic.label,
              onClick: function () { onJump(topic.nodeKey); },
              onMouseEnter: function () { setHoverKey(topic.key); },
              onMouseLeave: function () { setHoverKey(null); },
              onKeyDown: function (e) {
                if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onJump(topic.nodeKey); }
              },
              style: rowStyle(topic.level, active, hover)
            },
              el("span", {
                style: {
                  flex: "1 1 auto", minWidth: 0,
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap"
                }
              }, topic.label),
              el("span", { "data-kind": topic.kind, style: barStyle(active, hover, topic.kind) })
            );
          })
        )
      );
    }

    // ── main feature ─────────────────────────────────────────────────────
    function TocFeature(props) {
      var useSession = props.useSession;
      var sessionId = props.sessionId;

      // 兜底：极端情况下拿不到会话 store 时，只渲染开关按钮（不渲染面板）
      var noSession = typeof useSession !== "function";
      var topics = noSession ? EMPTY_TOPICS : useSession(function (s) {
        if (!s || !s.chat) return EMPTY_TOPICS;
        return buildTopics(s.chat.order, s.chat.nodes);
      }, sameTopics);

      var [mode, setMode] = useState(loadMode);
      var [activeKey, setActiveKey] = useState(null);
      var [box, setBox] = useState(null);
      var [railHover, setRailHover] = useState(false);
      var scrollportRef = useRef(null);

      var topicsSig = useMemo(function () {
        var parts = [];
        for (var i = 0; i < topics.length; i++) parts.push(topics[i].key + "|" + topics[i].level);
        return parts.join(",");
      }, [topics]);

      // 每个消息节点下最后一个主题的 key（用于「只有最后一个随节点高亮」）
      var lastPerNode = useMemo(function () {
        var map = {};
        for (var i = 0; i < topics.length; i++) map[topics[i].nodeKey] = topics[i].key;
        return map;
      }, [topics]);

      // 观察滚动容器：测量位置、监听滚动（scroll-spy）、监听内容变化
      useEffect(function () {
        var sp = findScrollport();
        if (!sp) return undefined;
        scrollportRef.current = sp;

        var computeActive = function () {
          var rows = sp.querySelectorAll("[data-chat-anchor-key]");
          if (rows.length === 0) { setActiveKey(null); return; }
          var reading = sp.getBoundingClientRect().top + READING_OFFSET;
          var active = null;
          // 主题区间判定：只统计主题锚点行（user / steering）。
          // 助手回答、工具调用等节点都属于其前一个主题的区间——只要阅读线落在
          // 该主题锚点之后、下一个主题锚点之前，该主题就持续高亮；
          // 滚到任意深度，只要还在当前主题的内容里，蓝色就不会消失。
          var firstTopicKey = null;
          for (var i = 0; i < rows.length; i++) {
            var kind = rows[i].dataset.chatFlowKind;
            if (kind !== "user" && kind !== "steering") continue;
            if (firstTopicKey === null) firstTopicKey = rows[i].dataset.chatAnchorKey;
            if (rows[i].getBoundingClientRect().top <= reading) active = rows[i].dataset.chatAnchorKey;
          }
          // 阅读线在所有主题锚点之上（内容不足一屏）→ 高亮第一个主题
          if (active === null) active = firstTopicKey;
          // 兜底：尚无主题行（只有上下文/压缩等节点）→ 高亮第一个节点
          if (active === null) active = rows[0].dataset.chatAnchorKey;
          setActiveKey(active);
        };

        var measure = function () {
          var r = sp.getBoundingClientRect();
          var flow = sp.querySelector("[data-chat-flow]");
          var contentRight = flow ? flow.getBoundingClientRect().right : r.right;
          var next = {
            top: r.top, bottom: r.bottom, left: r.left, right: r.right,
            width: r.width, height: r.height, contentRight: contentRight
          };
          setBox(function (prev) {
            if (prev && prev.top === next.top && prev.bottom === next.bottom &&
              prev.left === next.left && prev.right === next.right &&
              prev.width === next.width && prev.height === next.height &&
              prev.contentRight === next.contentRight) return prev;
            return next;
          });
        };

        measure();
        computeActive();

        var ro = new ResizeObserver(function () { measure(); computeActive(); });
        ro.observe(sp);
        var flow = sp.querySelector("[data-chat-flow]");
        if (flow) ro.observe(flow);

        var mo = new MutationObserver(function () { computeActive(); });
        if (flow) mo.observe(flow, { childList: true, subtree: true });

        var onScroll = function () { computeActive(); };
        sp.addEventListener("scroll", onScroll, { passive: true });
        window.addEventListener("resize", measure);

        return function () {
          ro.disconnect();
          mo.disconnect();
          window.removeEventListener("resize", measure);
          sp.removeEventListener("scroll", onScroll);
        };
      }, [sessionId, topicsSig]);

      var jump = useCallback(function (nodeKey) {
        var sp = scrollportRef.current;
        if (!sp) return;
        var rows = sp.querySelectorAll("[data-chat-anchor-key]");
        var row = null;
        for (var i = 0; i < rows.length; i++) {
          if (rows[i].dataset.chatAnchorKey === nodeKey) { row = rows[i]; break; }
        }
        if (!row) return;
        var target = row.getBoundingClientRect().top - sp.getBoundingClientRect().top + sp.scrollTop - 20;
        try { sp.scrollTo({ top: target, behavior: "smooth" }); }
        catch (e) { sp.scrollTop = target; }
        setActiveKey(nodeKey);
      }, []);

      var cycle = useCallback(function () {
        setMode(function (m) {
          var next = m === "expanded" ? "rail" : m === "rail" ? "hidden" : "expanded";
          saveMode(next);
          return next;
        });
      }, []);

      // 布局：消息列右侧到「中列右缘」的留白。面板只在中列内浮动，
      // 不会压住右侧的 details 面板（工具详情/轨迹等）。
      var gapInColumn = box ? box.right - box.contentRight : 0;
      var effectiveMode = mode;
      if (effectiveMode === "expanded" && (!box || gapInColumn < EXPAND_MIN_ROOM)) effectiveMode = "rail";
      if (!box || topics.length === 0) effectiveMode = "hidden";

      var panelRoot = null;
      if (effectiveMode === "expanded") {
        // 面板放在消息列右侧的留白中：左缘贴 contentRight + 14，宽度随留白自适应
        var width = Math.max(180, Math.min(230, gapInColumn - 22));
        var left = Math.max(8, box.contentRight + 14);
        panelRoot = el(TocPanel, {
          topics: topics,
          activeKey: activeKey,
          lastPerNode: lastPerNode,
          onJump: jump,
          onHide: function () { setMode("hidden"); saveMode("hidden"); },
          style: {
            position: "fixed",
            top: "50%",
            transform: "translateY(-50%)",
            left: left + "px",
            width: width,
            maxHeight: "min(560px, calc(100vh - 140px))",
            display: "flex",
            flexDirection: "column",
            background: C.bgBase,
            border: "1px solid " + C.border1,
            borderRadius: 12,
            boxShadow: C.shadow2,
            zIndex: 50,
            overflow: "hidden",
            fontFamily: "var(--dsw-font-family, inherit)",
            color: C.labelPrimary
          }
        });
      } else if (effectiveMode === "rail") {
        // 悬停容器：鼠标靠近胶囊条时，在左侧展开主题气泡面板；鼠标离开后收回。
        // 面板与胶囊条同属一个容器，鼠标在两者之间移动不会闪烁。
        panelRoot = el("div", {
          onMouseEnter: function () { setRailHover(true); },
          onMouseLeave: function () { setRailHover(false); },
          style: {
            position: "fixed",
            top: "50%",
            transform: "translateY(-50%)",
            right: (window.innerWidth - box.right) + 8 + "px",
            display: "flex",
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
            zIndex: 50
          }
        },
          railHover ? el(TocHoverPanel, {
            topics: topics,
            activeKey: activeKey,
            lastPerNode: lastPerNode,
            onJump: jump
          }) : null,
          el(TocRail, {
            topics: topics,
            activeKey: activeKey,
            lastPerNode: lastPerNode,
            onJump: jump,
            style: {
              display: "flex",
              flexDirection: "column",
              gap: 7,
              padding: "10px 6px",
              borderRadius: 10,
              background: railHover ? C.bgLayer2 : C.bgLayer1,
              border: "1px solid " + (railHover ? "rgba(90,140,255,.45)" : C.border1),
              boxShadow: C.shadow2,
              transition: "background .12s ease,border-color .12s ease"
            }
          })
        );
      }

      return el(React.Fragment, null,
        el(TocToggleButton, { mode: mode, count: topics.length, onClick: cycle }),
        panelRoot ? ReactDOM.createPortal(panelRoot, document.body) : null
      );
    }

    // ── plugin ───────────────────────────────────────────────────────────
    var inject = ["slots"];

    function apply(ctx) {
      var slots = ctx.slots || (ctx.get && ctx.get("slots"));

      if (ctx.effect) {
        ctx.effect(function () {
          var id = "dsh-conversation-toc/client";
          var existing = document.querySelector('style[data-plugin-css="' + id + '"]');
          if (existing) return function () {};
          var style = document.createElement("style");
          style.dataset.plugin = "dsh-conversation-toc";
          style.dataset.pluginCss = id;
          style.textContent = CSS;
          document.head.appendChild(style);
          return function () { style.remove(); };
        }, "dsh-conversation-toc: styles");
      } else if (typeof document !== "undefined") {
        // 兜底：无 effect 生命周期时直接注入样式
        try {
          var style2 = document.createElement("style");
          style2.dataset.plugin = "dsh-conversation-toc";
          style2.dataset.pluginCss = "dsh-conversation-toc/client";
          style2.textContent = CSS;
          document.head.appendChild(style2);
        } catch (e) {}
      }

      if (slots === undefined) return;

      slots.inject("conversation.session.header.utilities", function () {
        return slots.register(
          {
            name: "conversation.session.header.utilities",
            id: "conversation-toc-toggle",
            order: 100,
            label: "对话大纲"
          },
          function (props) { return el(TocFeature, props); }
        );
      });
    }

    // 仅测试环境暴露内部函数（浏览器端 process 不存在，此分支不会执行）
    if (typeof process !== "undefined" && process.env && process.env.DSH_TOC_TEST) {
      exports.__test = {
        buildTopics: buildTopics,
        textOfContent: textOfContent,
        cleanLine: cleanLine,
        firstLine: firstLine,
        truncate: truncate,
        sameTopics: sameTopics,
        isTopicActive: isTopicActive
      };
    }

    exports.inject = inject;
    exports.apply = apply;
    return module.exports;
  }
});
