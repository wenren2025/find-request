(function() {
  'use strict';
  
  console.log('[API捕获器] 新版Content script 已加载');
  
  // 状态管理
  let isListening = false;
  let lastClickTime = 0;
  let lastClickElement = null;
  let capturedRequests = [];
  
  // 浮动面板相关
  let floatingPanel = null;
  let isPanelVisible = false;
  
  // 网络请求监听器
  let networkObserver = null;
  let requestMap = new Map(); // 存储正在进行的请求
  
  // 初始化网络监听
  function initNetworkMonitoring() {
    console.log('[API捕获器] 初始化网络监听');
    
    // 方法1: 使用Performance Observer API
    if ('PerformanceObserver' in window) {
      try {
        networkObserver = new PerformanceObserver((list) => {
          const entries = list.getEntries();
          entries.forEach(entry => {
            if (entry.entryType === 'resource' || entry.entryType === 'navigation') {
              handleNetworkEntry(entry);
            }
          });
        });
        
        networkObserver.observe({ entryTypes: ['resource', 'navigation'] });
        console.log('[API捕获器] PerformanceObserver 已启动');
      } catch (error) {
        console.error('[API捕获器] PerformanceObserver 启动失败:', error);
      }
    }
    
    // 方法2: 监听所有网络请求的事件
    setupNetworkEventListeners();
    
    // 方法3: 重写fetch和XMLHttpRequest (作为备用)
    setupRequestInterception();
  }
  
  // 处理Performance API的网络条目
  function handleNetworkEntry(entry) {
    if (!isListening) return;
    
    // 过滤掉非XHR/Fetch请求
    if (!isRelevantRequest(entry)) return;
    
    // 检查是否在点击时间窗口内
    const timeSinceClick = Date.now() - lastClickTime;
    if (timeSinceClick > 15000) { // 15秒窗口
      console.log('[API捕获器] 请求超出时间窗口:', timeSinceClick, 'ms');
      return;
    }
    
    console.log('[API捕获器] 检测到网络请求:', entry.name);
    
    const requestInfo = {
      type: 'PerformanceEntry',
      method: 'GET', // Performance API无法获取方法，默认GET
      url: entry.name,
      timestamp: Date.now(),
      duration: entry.duration,
      size: entry.transferSize || 0,
      clickElement: getElementInfo(lastClickElement),
      timeSinceClick: timeSinceClick
    };
    
    captureRequest(requestInfo);
  }
  
  // 判断是否是相关的请求
  function isRelevantRequest(entry) {
    const url = entry.name;
    
    // 排除静态资源
    if (url.match(/\.(css|js|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|eot)$/i)) {
      return false;
    }
    
    // 排除Chrome扩展请求
    if (url.startsWith('chrome-extension://')) {
      return false;
    }
    
    // 排除data: 和 blob: URLs
    if (url.startsWith('data:') || url.startsWith('blob:')) {
      return false;
    }
    
    // 只关注HTTP/HTTPS请求
    if (!url.startsWith('http')) {
      return false;
    }
    
    return true;
  }
  
  // 设置网络事件监听器
  function setupNetworkEventListeners() {
    console.log('[API捕获器] 设置网络事件监听器');
    
    // 监听页面上的所有form提交
    document.addEventListener('submit', function(event) {
      if (!isListening) return;
      
      console.log('[API捕获器] 检测到表单提交');
      lastClickTime = Date.now();
      lastClickElement = event.target;
      
      // 延迟捕获，等待表单提交完成
      setTimeout(() => {
        checkForNewRequests();
      }, 100);
    }, true);
    
    // 监听AJAX相关事件
    window.addEventListener('beforeunload', function() {
      console.log('[API捕获器] 页面即将卸载');
    });
  }
  
  // 设置请求拦截（作为备用方案）
  function setupRequestInterception() {
    console.log('[API捕获器] 设置请求拦截');
    
    // 保存原始方法
    const originalFetch = window.fetch;
    const originalXHROpen = XMLHttpRequest.prototype.open;
    const originalXHRSend = XMLHttpRequest.prototype.send;
    
    // 拦截fetch
    window.fetch = function(input, init = {}) {
      const url = typeof input === 'string' ? input : input.url;
      const method = init.method || 'GET';
      
      console.log('[API捕获器] 拦截fetch:', method, url);
      
      if (isListening) {
        const timeSinceClick = Date.now() - lastClickTime;
        if (timeSinceClick < 15000) {
          console.log('[API捕获器] 捕获fetch请求');
          
          const requestInfo = {
            type: 'fetch',
            method: method,
            url: url,
            data: init.body,
            headers: init.headers || {},
            timestamp: Date.now(),
            clickElement: getElementInfo(lastClickElement),
            timeSinceClick: timeSinceClick
          };
          
          captureRequest(requestInfo);
        }
      }
      
      return originalFetch.apply(this, arguments);
    };
    
    // 拦截XMLHttpRequest
    XMLHttpRequest.prototype.open = function(method, url, async, user, password) {
      this._method = method;
      this._url = url;
      console.log('[API捕获器] 拦截XHR open:', method, url);
      return originalXHROpen.apply(this, arguments);
    };
    
    XMLHttpRequest.prototype.send = function(data) {
      console.log('[API捕获器] 拦截XHR send:', this._method, this._url);
      
      if (isListening) {
        const timeSinceClick = Date.now() - lastClickTime;
        if (timeSinceClick < 15000) {
          console.log('[API捕获器] 捕获XHR请求');
          
          const requestInfo = {
            type: 'XMLHttpRequest',
            method: this._method || 'GET',
            url: this._url,
            data: data,
            timestamp: Date.now(),
            clickElement: getElementInfo(lastClickElement),
            timeSinceClick: timeSinceClick
          };
          
          captureRequest(requestInfo);
        }
      }
      
      return originalXHRSend.apply(this, arguments);
    };
  }
  
  // 检查新的请求
  function checkForNewRequests() {
    if (!isListening) return;
    
    // 获取最近的性能条目
    const entries = performance.getEntriesByType('resource');
    const recentEntries = entries.filter(entry => {
      const entryTime = entry.startTime + performance.timeOrigin;
      return entryTime > lastClickTime - 1000; // 点击前后1秒内的请求
    });
    
    console.log('[API捕获器] 检查到', recentEntries.length, '个最近的请求');
    
    recentEntries.forEach(entry => {
      if (isRelevantRequest(entry)) {
        handleNetworkEntry(entry);
      }
    });
  }
  
  // 捕获请求
  function captureRequest(requestInfo) {
    console.log('[API捕获器] 请求已捕获:', requestInfo);
    
    // 尝试解析请求数据
    let parsedData = null;
    if (requestInfo.data) {
      try {
        if (typeof requestInfo.data === 'string') {
          parsedData = JSON.parse(requestInfo.data);
        } else if (requestInfo.data instanceof FormData) {
          parsedData = {};
          for (let [key, value] of requestInfo.data.entries()) {
            parsedData[key] = value;
          }
        } else {
          parsedData = requestInfo.data;
        }
      } catch (e) {
        console.log('[API捕获器] 数据解析失败:', e);
        parsedData = requestInfo.data;
      }
    }
    
    const capturedRequest = {
      ...requestInfo,
      parsedData: parsedData,
      id: Date.now() + Math.random()
    };
    
    capturedRequests.push(capturedRequest);
    
    // 发送消息到background script
    chrome.runtime.sendMessage({
      type: 'REQUEST_CAPTURED',
      request: capturedRequest
    }).catch(err => {
      console.log('[API捕获器] 发送消息失败:', err);
    });
    
    // 更新浮动面板
    updateFloatingPanel();
    
    // 限制存储的请求数量
    if (capturedRequests.length > 50) {
      capturedRequests = capturedRequests.slice(-50);
    }
  }
  
  // 获取元素信息
  function getElementInfo(element) {
    if (!element) return null;
    
    return {
      tagName: element.tagName,
      className: element.className,
      id: element.id,
      textContent: element.textContent?.substring(0, 50) || '',
      outerHTML: element.outerHTML?.substring(0, 200) || ''
    };
  }
  
  // 监听按钮点击
  function setupClickListener() {
    console.log('[API捕获器] 设置点击监听器');
    
    document.addEventListener('click', function(event) {
      if (!isListening) return;
      
      const element = event.target;
      console.log('[API捕获器] 检测到点击:', element);
      
      // 判断是否为按钮或可点击元素
      if (isClickableElement(element)) {
        console.log('[API捕获器] 点击了可监听元素:', element);
        lastClickTime = Date.now();
        lastClickElement = element;
        
        // 立即检查是否有新的请求
        setTimeout(() => {
          checkForNewRequests();
        }, 100);
        
        // 再次检查（处理延迟请求）
        setTimeout(() => {
          checkForNewRequests();
        }, 1000);
        
        // 发送点击事件到background
        chrome.runtime.sendMessage({
          type: 'BUTTON_CLICKED',
          element: getElementInfo(element),
          timestamp: lastClickTime
        }).catch(err => {
          console.log('[API捕获器] 发送点击消息失败:', err);
        });
      }
    }, true);
  }
  
  // 判断是否为可点击元素
  function isClickableElement(element) {
    if (!element) return false;
    
    const tagName = element.tagName?.toLowerCase();
    const type = element.type?.toLowerCase();
    
    // 明确的按钮元素
    if (tagName === 'button' || 
        (tagName === 'input' && ['button', 'submit'].includes(type)) ||
        element.getAttribute('role') === 'button') {
      return true;
    }
    
    // 具有点击事件的元素
    if (element.onclick || 
        element.getAttribute('onclick') ||
        element.style.cursor === 'pointer') {
      return true;
    }
    
    // 常见的可点击class名称
    const className = element.className?.toLowerCase() || '';
    if (className.includes('btn') || 
        className.includes('button') ||
        className.includes('click') ||
        className.includes('submit')) {
      return true;
    }
    
    return false;
  }
  
  // 创建浮动面板（简化版）
  function createFloatingPanel() {
    if (floatingPanel) return;
    
    console.log('[API捕获器] 创建浮动面板');
    
    floatingPanel = document.createElement('div');
    floatingPanel.id = 'api-catcher-panel';
    floatingPanel.innerHTML = `
      <div style="
        position: fixed;
        top: 20px;
        right: 20px;
        width: 300px;
        background: white;
        border: 1px solid #ddd;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        z-index: 999999;
        font-family: Arial, sans-serif;
        font-size: 14px;
      ">
        <div style="
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          padding: 12px;
          border-radius: 8px 8px 0 0;
          display: flex;
          justify-content: space-between;
          align-items: center;
        ">
          <span style="font-weight: 600;">API捕获器</span>
          <div>
            <button id="panel-toggle-btn" style="
              background: rgba(255,255,255,0.2);
              border: none;
              color: white;
              padding: 4px 8px;
              border-radius: 4px;
              cursor: pointer;
              margin-right: 8px;
            ">开始监听</button>
            <button id="panel-close-btn" style="
              background: rgba(255,255,255,0.2);
              border: none;
              color: white;
              padding: 4px 8px;
              border-radius: 4px;
              cursor: pointer;
            ">×</button>
          </div>
        </div>
        <div style="padding: 12px;">
          <div style="margin-bottom: 8px;">
            状态: <span id="panel-status-text" style="font-weight: 600;">未监听</span>
          </div>
          <div style="margin-bottom: 8px;">
            请求数: <span id="panel-count-text" style="font-weight: 600;">0</span>
          </div>
          <div id="panel-requests-list" style="max-height: 200px; overflow-y: auto;">
            <div style="text-align: center; color: #666; padding: 20px;">暂无请求</div>
          </div>
        </div>
      </div>
    `;
    
    document.body.appendChild(floatingPanel);
    
    // 绑定事件
    document.getElementById('panel-toggle-btn').addEventListener('click', function() {
      if (isListening) {
        chrome.runtime.sendMessage({ type: 'STOP_LISTENING_ALL_TABS' });
      } else {
        chrome.runtime.sendMessage({ type: 'START_LISTENING_ALL_TABS' });
      }
    });
    
    document.getElementById('panel-close-btn').addEventListener('click', function() {
      hideFloatingPanel();
    });
    
    updateFloatingPanel();
  }
  
  // 显示浮动面板
  function showFloatingPanel() {
    if (!floatingPanel) {
      createFloatingPanel();
    }
    floatingPanel.style.display = 'block';
    isPanelVisible = true;
    console.log('[API捕获器] 显示浮动面板');
  }
  
  // 隐藏浮动面板
  function hideFloatingPanel() {
    if (floatingPanel) {
      floatingPanel.style.display = 'none';
    }
    isPanelVisible = false;
    console.log('[API捕获器] 隐藏浮动面板');
  }
  
  // 更新浮动面板
  function updateFloatingPanel() {
    if (!floatingPanel || !isPanelVisible) return;
    
    const statusText = document.getElementById('panel-status-text');
    const countText = document.getElementById('panel-count-text');
    const requestsList = document.getElementById('panel-requests-list');
    const toggleBtn = document.getElementById('panel-toggle-btn');
    
    if (statusText) {
      statusText.textContent = isListening ? '正在监听' : '未监听';
      statusText.style.color = isListening ? '#28a745' : '#dc3545';
    }
    
    if (countText) {
      countText.textContent = capturedRequests.length;
    }
    
    if (toggleBtn) {
      toggleBtn.textContent = isListening ? '停止监听' : '开始监听';
    }
    
    if (requestsList) {
      if (capturedRequests.length === 0) {
        requestsList.innerHTML = '<div style="text-align: center; color: #666; padding: 20px;">暂无请求</div>';
      } else {
        const recentRequests = capturedRequests.slice(-5);
        requestsList.innerHTML = recentRequests.map(req => `
          <div style="
            background: #f8f9fa;
            border: 1px solid #e9ecef;
            border-radius: 4px;
            padding: 8px;
            margin-bottom: 8px;
            font-size: 12px;
          ">
            <div style="font-weight: 600; color: #007bff;">${req.method || 'GET'}</div>
            <div style="word-break: break-all; color: #666;">${req.url || '未知URL'}</div>
            <div style="color: #999; font-size: 10px;">延迟: ${req.timeSinceClick || 0}ms</div>
          </div>
        `).join('');
      }
    }
  }
  
  // 监听来自popup的消息
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('[API捕获器] 收到消息:', message);
    
    switch (message.type) {
      case 'START_LISTENING':
        isListening = true;
        console.log('[API捕获器] Content Script开始监听');
        updateFloatingPanel();
        sendResponse({ success: true });
        return true;
        
      case 'STOP_LISTENING':
        isListening = false;
        console.log('[API捕获器] Content Script停止监听');
        updateFloatingPanel();
        sendResponse({ success: true });
        return true;
        
      case 'TOGGLE_FLOATING_PANEL':
        if (isPanelVisible) {
          hideFloatingPanel();
        } else {
          showFloatingPanel();
        }
        sendResponse({ success: true, visible: isPanelVisible });
        return true;
        
      default:
        console.log('[API捕获器] 未知消息类型:', message.type);
        return false;
    }
  });
  
  // 初始化
  function init() {
    console.log('[API捕获器] 初始化开始');
    
    // 等待DOM加载完成
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function() {
        console.log('[API捕获器] DOM加载完成');
        setupClickListener();
        initNetworkMonitoring();
      });
    } else {
      console.log('[API捕获器] DOM已经加载完成');
      setupClickListener();
      initNetworkMonitoring();
    }
    
    console.log('[API捕获器] 初始化完成');
  }
  
  // 启动
  init();
})(); 