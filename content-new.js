(function() {
  'use strict';
  
  console.log('[API捕获器] 🚀 webRequest版本 Content Script已加载');
  console.log('[API捕获器] 📍 当前页面URL:', window.location.href);
  console.log('[API捕获器] 📍 当前页面标题:', document.title);
  
  // 检查扩展上下文
  function isExtensionContextValid() {
    try {
      return chrome.runtime && chrome.runtime.id;
    } catch (e) {
      return false;
    }
  }
  
  if (!isExtensionContextValid()) {
    console.log('[API捕获器] 扩展上下文已失效，停止加载');
    return;
  }
  
  // 状态管理
  let isListening = false;
  console.log('[API捕获器] 📊 初始监听状态:', isListening);
  
  // 定期报告状态（调试用）
  setInterval(() => {
    console.log(`[API捕获器] 💓 Content Script运行正常 - 监听状态: ${isListening}, 页面: ${window.location.href}`);
  }, 10000); // 每10秒报告一次
  
  // 点击事件监听器
  function setupClickListener() {
    console.log('[API捕获器] 🖱️ 设置点击事件监听');
    
    document.addEventListener('click', function(event) {
      if (!isListening) return;
      
      const element = event.target;
      const clickTime = Date.now();
      
      console.log('[API捕获器] 🎯 检测到点击:', element.tagName, element.className || element.id);
      
      // 获取元素信息
      const elementInfo = {
        tagName: element.tagName,
        className: element.className,
        id: element.id,
        textContent: element.textContent?.substring(0, 50) || '',
        type: element.type || '',
        name: element.name || '',
        href: element.href || '',
        onclick: !!element.onclick,
        hasEventListeners: !!element.addEventListener
      };
      
      // 发送点击信息到 Background Script
      try {
        if (chrome.runtime && chrome.runtime.id) {
          chrome.runtime.sendMessage({
            type: 'CLICK_RECORDED',
            data: {
              timestamp: clickTime,
              element: elementInfo,
              pageUrl: window.location.href,
              tabId: null // 将由 Background Script 填充
            }
          }).then(() => {
            console.log('[API捕获器] ✅ 点击信息已发送到Background');
          }).catch(err => {
            console.log('[API捕获器] ❌ 发送点击信息失败:', err);
          });
        }
      } catch (error) {
        console.log('[API捕获器] ❌ 发送点击信息异常:', error);
      }
      
    }, true); // 使用捕获阶段
    
    console.log('[API捕获器] ✅ 点击监听器已设置');
  }
  
  // 监听来自 Background Script 的消息
  try {
    if (chrome.runtime && chrome.runtime.onMessage) {
      chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        console.log('[API捕获器] 📨 收到Background消息:', message);
        
        if (!chrome.runtime || !chrome.runtime.id) {
          return false;
        }
        
        switch (message.type) {
          case 'START_LISTENING':
            isListening = true;
            console.log('[API捕获器] 🎧 开始监听点击事件');
            sendResponse({ success: true });
            break;
            
          case 'STOP_LISTENING':
            isListening = false;
            console.log('[API捕获器] 🔇 停止监听点击事件');
            sendResponse({ success: true });
            break;
            
          case 'GET_LISTENING_STATUS':
            sendResponse({ isListening: isListening });
            break;
            
          default:
            sendResponse({ success: false, error: 'Unknown message type' });
            break;
        }
        
        return true;
      });
    }
  } catch (error) {
    console.error('[API捕获器] ❌ 消息监听器设置失败:', error);
  }
  
  // 初始化
  function initialize() {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function() {
        console.log('[API捕获器] DOM已加载，初始化点击监听');
        setupClickListener();
      });
    } else {
      console.log('[API捕获器] DOM已就绪，立即初始化点击监听');
      setupClickListener();
    }
  }
  
  // 启动
  initialize();
  
  console.log('[API捕获器] 🎉 webRequest版本 Content Script初始化完成');
  
})(); 