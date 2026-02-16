// Mock environment for SSR
(global as any).IS_SSR = true;
(global as any).window = {};
(global as any).document = {
    createElement: () => ({}),
    querySelector: () => null,
};
(global as any).Node = {
    ELEMENT_NODE: 1,
    TEXT_NODE: 3,
    COMMENT_NODE: 8,
};
