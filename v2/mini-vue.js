import { proxyRefs, effect } from '../node_modules/@vue/reactivity/dist/reactivity.esm-browser.js'
import { createVNode } from './vnode.js'
// 当前运行的组件实例
export let currentInstance = null
// 当前运行的渲染组件实例
export let currentRenderingInstance = null

// 创建渲染器
function createRenderer(options) {
    // 把参数进行解构进行重命名，方便区分理解
    const {
        createElement: hostCreateElement,
        insert: hostInsert,
    } = options
    // 渲染函数，主要是把一个虚拟 DOM 渲染到某一个元素节点上
    function render(vnode, container, parentComponent) {
        patch(null, vnode, container, parentComponent)
    }
    // 补丁函数
    function patch(n1, n2, container, parentComponent) {
        const { type } = n2
        if(typeof type === 'string') {
            // 作为普通元素进行处理
            if (!n1) {
                // 创建节点
                mountElement(n2, container, parentComponent)
            } else {
                // 更新节点
            }
        } else if(typeof type === 'object') {
            // 如果是 type 是对象，那么就作为组件进行处理
            if(!n1) {
                // 挂载组件
                mountComponent(n2, container, parentComponent)
            } else {
                // 更新组件
            }
        }
    }
    // 初始化一个组件的上下文内容
    const emptyAppContext = createAppContext()

    function mountComponent(vnode, container, parent) {
        // 组件上下文继承父组件的上下文或者虚拟DOM 的上下文，如果都不存在则创建一个空的上下文
        const appContext =
              (parent ? parent.appContext : vnode.appContext) || emptyAppContext
        // 定义组件实例，一个组件实例本质上就是一个对象，它包含与组件有关的状态信息
        const instance = {
            vnode,
            type: vnode.type,
            appContext,
            setupState: null, // 组件自身的状态数据，即 setup 的返回值
            isMounted: false, // 用来表示组件是否已经被挂载，初始值为 false
            subTree: null, // 组件所渲染的内容，即子树 (subTree)
            update: null, // 更新函数
            render: null, // 组件渲染函数
            proxy: null, // 组件代理对象
        }
        vnode.component = instance
        const { setup, render } = instance.type
        // 设置当前的组件实例
        setCurrentInstance(instance)
        const setupResult = setup()
        // 设置当前组件当前组件实例为空
        setCurrentInstance(null)

        if(typeof setupResult === 'object') {
            // 如果组件的 setup 方法返回的是一个对象，则通过 proxyRefs 方法处理之后设置到 instance 的 setupState 属性上
            // proxyRefs 转换 ref 类型省去 .value 繁琐操作
            instance.setupState = proxyRefs(setupResult)
        }
        instance.proxy = new Proxy({ _:instance }, {
            get({ _: instance}, key) {
                if(key in instance.setupState) {
                    return instance.setupState[key]
                }
            }
        })
        instance.render = render

        instance.update = effect(() => {
            // 如果 isMounted 为 false 则是组件挂载阶段
            if(!instance.isMounted) {
                const subTree = (instance.subTree = renderComponentRoot(instance))
                patch(null, subTree, container, instance)
                instance.vnode.el = subTree.el
                instance.isMounted = true
            } else {
                // 组件更新阶段
            }
        })

    }

    function mountElement(vnode, container, parentComponent) {
        const el = (vnode.el = hostCreateElement(vnode.type))
        const { children } = vnode
        if(typeof children === 'string') {
            el.textContent = children
        } else if(Array.isArray(children)) {
            mountChildren(children, container, parentComponent)
        }
        
        hostInsert(el, container)
    }

    function mountChildren(children, container, parentComponent) {
        children.forEach((v) => {
          patch(null, v, container, parentComponent)
        })
    }

    return {
        createApp: createAppAPI(render)
    }
}

function setCurrentInstance(instance) {
    currentInstance = instance
}

function renderComponentRoot(
    instance
  ) {
    const { proxy, render } = instance
    let result
    // 返回上一个实例对象
    const prev = setCurrentRenderingInstance(instance)
    result = render.call(proxy)
    // 再设置当前的渲染对象上一个，具体场景是嵌套循环渲染的时候，渲染完子组件，再去渲染父组件
    setCurrentRenderingInstance(prev)
    return result
}

function setCurrentRenderingInstance(instance) {
    const prev = currentRenderingInstance
    currentRenderingInstance = instance
    return prev
}

function createAppAPI(render) {
    return function createApp(rootComponent) {
        const context = createAppContext()
        const installedPlugins = new Set()
        const app = (context.app = {
            use(plugin, ...options) {
                if (installedPlugins.has(plugin)) {
                  console.warn(`Plugin has already been applied to target app.`)
                } else if (plugin && typeof plugin.install === 'function') {
                  installedPlugins.add(plugin)
                  plugin.install(app, ...options)
                } else if (typeof plugin === 'function') {
                  installedPlugins.add(plugin)
                  plugin(app, ...options)
                }
                return app
            },
            component(name, component) {
                if (!component) {
                  return context.components[name]
                }
                context.components[name] = component
                return app
            },
            mount(rootContainer) {
                const vnode = createVNode(rootComponent)
                vnode.appContext = context
                render(vnode, rootContainer)
            }
        })
        return app
    }
}
// 当前组件上下文对象，其中包含config，app等
function createAppContext() {
    return {
        app: null,
        config: {},
        mixins: [],
        components: {},
        directives: {},
        provides: Object.create(null),
      }
}

function createElement(type) {
    return document.createElement(type)
}

function insert(child, parent, anchor) {
    parent.insertBefore(child, anchor || null)
}

const renderer = createRenderer({
    createElement,
    insert,
})

export function createApp(...args) {
    return renderer.createApp(...args)
}