// Smoke test for dsh-conversation-toc/lib/client.js pure helpers.
// Run: node scripts/smoke-test.js  (cwd = package root)
const fs = require('fs');
const path = require('path');

process.env.DSH_TOC_TEST = '1';

global.window = {
  __ModuleLoader__: {
    load: (handoff) => { global.__handoff = handoff; }
  }
};

const requireStub = (id) => {
  if (id === 'react') {
    return {
      createElement: (...a) => ({ tag: a[0], props: a[1] || {}, children: a.slice(2) }),
      useState: () => [undefined, () => {}],
      useEffect: () => {},
      useRef: () => ({}),
      useMemo: (f) => f(),
      useCallback: (f) => f,
      Fragment: 'frag'
    };
  }
  if (id === 'react-dom') return { createPortal: (c) => c };
  throw new Error('unexpected require: ' + id);
};

const src = fs.readFileSync(path.join(__dirname, '..', 'lib', 'client.js'), 'utf8');
(0, eval)(src);
if (!global.__handoff) throw new Error('factory was not registered');
const mod = global.__handoff.factory(requireStub);
const T = mod.__test;
if (!T) throw new Error('__test hook missing');

let failures = 0;
const check = (name, actual, expected) => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) { console.log('  ok  ' + name); }
  else { failures++; console.log('  FAIL ' + name + '\n    expected ' + e + '\n    actual   ' + a); }
};

console.log('textOfContent');
check('text parts', T.textOfContent([{ type: 'text', text: 'hi' }, { type: 'image' }, 'raw']), 'hi\nraw');
check('nested paragraph', T.textOfContent([{ type: 'paragraph', children: [{ type: 'text', text: '内嵌' }] }]), '内嵌');
check('null/empty', T.textOfContent(null), '');
check('string passthrough', T.textOfContent('abc'), 'abc');

console.log('cleanLine / firstLine');
check('heading strip', T.cleanLine('## 标题'), '标题');
check('list strip', T.cleanLine('- 项目'), '项目');
check('markdown link', T.cleanLine('[链接](http://x) 和 **粗**'), '链接 和 粗');
check('firstLine skips blanks', T.firstLine('\n\n正文第一行\n第二行'), '正文第一行');

console.log('truncate');
check('short stays', T.truncate('12345', 6), '12345');
check('long truncates', T.truncate('123456789', 5), '1234…');

console.log('buildTopics');
const mk = (key, kind, contentOrBlocks, useBlocks) => ({
  key,
  kind,
  data: useBlocks ? { blocks: contentOrBlocks } : { content: contentOrBlocks }
});
const order = ['u1', 's1', 'a1', 'c1'];
const nodes = new Map([
  ['u1', mk('u1', 'user', [{ type: 'text', text: '第一个问题是什么？\n补充说明' }])],
  ['s1', mk('s1', 'steering', [{ type: 'text', text: '继续处理子任务' }])],
  ['a1', mk('a1', 'assistant-step', [{ type: 'text', text: '好的。\n## 第一节\n内容\n### 小节\n继续' }], true)],
  ['c1', mk('c1', 'context', [{ type: 'text', text: '注入上下文' }])]
]);
const topics = T.buildTopics(order, nodes);
check('count', topics.length, 4);
check('user topic', topics[0], { key: 'u1', nodeKey: 'u1', level: 0, kind: 'user', label: '第一个问题是什么？', node: nodes.get('u1') });
check('steering topic', topics[1], { key: 's1', nodeKey: 's1', level: 1, kind: 'steering', label: '继续处理子任务', node: nodes.get('s1') });
check('heading1 topic', topics[2], { key: 'a1#h1', nodeKey: 'a1', level: 2, kind: 'heading', label: '第一节', node: nodes.get('a1') });
check('heading2 topic', topics[3], { key: 'a1#h3', nodeKey: 'a1', level: 2, kind: 'heading', label: '小节', node: nodes.get('a1') });
check('empty order', T.buildTopics([], new Map()), []);
check('null nodes', T.buildTopics(['x'], null), []);
check('node without key skipped', T.buildTopics(['nk'], new Map([['nk', { kind: 'user', data: { content: [{ type: 'text', text: '无 key 节点' }] } }]])), []);

console.log('sameTopics');
check('identical', T.sameTopics(topics, T.buildTopics(order, nodes)), true);
const altered = T.buildTopics(order, nodes);
altered[0] = { ...altered[0], label: '改了' };
check('changed label', T.sameTopics(topics, altered), false);
check('length diff', T.sameTopics(topics, topics.slice(1)), false);

console.log('isTopicActive (回归：全部变蓝 bug)');
// lastPerNode: u1 -> u1, s1 -> s1, a1 -> a1#h3（最后一个 heading）
const lpn = { u1: 'u1', s1: 's1', a1: 'a1#h3' };
check('activeKey 命中该节点且是最后一个 → active', T.isTopicActive('u1', { nodeKey: 'u1', key: 'u1' }, lpn), true);
check('activeKey 命中但非最后（前面的 heading）→ 不 active', T.isTopicActive('a1', { nodeKey: 'a1', key: 'a1#h1' }, lpn), false);
check('最后一个 heading 随节点高亮 → active', T.isTopicActive('a1', { nodeKey: 'a1', key: 'a1#h3' }, lpn), true);
check('activeKey 不命中该节点 → 不 active', T.isTopicActive('s1', { nodeKey: 'u1', key: 'u1' }, lpn), false);
check('activeKey 为 null → 全部不 active', T.isTopicActive(null, { nodeKey: 'u1', key: 'u1' }, lpn), false);
check('空 lastPerNode 防御 → 不 active', T.isTopicActive('u1', { nodeKey: 'u1', key: 'u1' }, {}), false);

console.log('module surface');
check('inject', mod.inject, ['slots']);
check('apply is function', typeof mod.apply, 'function');

if (failures > 0) {
  console.log('\n' + failures + ' check(s) FAILED');
  process.exit(1);
}
console.log('\nAll smoke checks passed.');
