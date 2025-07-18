console.log('[API捕获器] Background script 已加载');

// 存储捕获的请求数据
let allCapturedRequests = [];

// 监听状态管理
let isListening = false;

// 监听来自content script的消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('[API捕获器] Background收到消息:', message);
  
  switch (message.type) {
    case 'BUTTON_CLICKED':
      console.log('[API捕获器] 用户点击了按钮:', message.element);
      // 可以在这里添加额外的处理逻辑
      break;
      
    case 'REQUEST_CAPTURED':
      console.log('[API捕获器] 捕获到API请求:', message.request);
      
      // 存储请求到内存
      allCapturedRequests.push({
        ...message.request,
        tabId: sender.tab?.id,
        tabUrl: sender.tab?.url,
        capturedAt: new Date().toISOString()
      });
      
      // 限制存储数量
      if (allCapturedRequests.length > 100) {
        allCapturedRequests = allCapturedRequests.slice(-100);
      }
      
      // 存储到chrome.storage
      chrome.storage.local.set({
        capturedRequests: allCapturedRequests
      }).then(() => {
        console.log('[API捕获器] 请求已存储到chrome.storage');
      }).catch(err => {
        console.error('[API捕获器] 存储失败:', err);
      });
      
      // 通知popup更新（如果popup打开着）
      chrome.runtime.sendMessage({
        type: 'REQUEST_UPDATED',
        requestCount: allCapturedRequests.length
      }).catch(() => {
        // popup可能没有打开，忽略错误
      });
      
      break;
  }
});

// 监听来自popup的消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('[API捕获器] Background处理popup消息:', message);
  
  switch (message.type) {
    case 'GET_ALL_REQUESTS':
      console.log('[API捕获器] 返回所有请求:', allCapturedRequests.length);
      sendResponse({ requests: allCapturedRequests });
      return true; // 表示异步响应
      
    case 'CLEAR_ALL_REQUESTS':
      allCapturedRequests = [];
      chrome.storage.local.set({ capturedRequests: [] }).then(() => {
        console.log('[API捕获器] 已清空所有请求');
        sendResponse({ success: true });
      }).catch(err => {
        console.error('[API捕获器] 清空失败:', err);
        sendResponse({ success: false, error: err.message });
      });
      return true; // 表示异步响应
      
    case 'GET_LISTENING_STATUS':
      console.log('[API捕获器] 返回监听状态:', isListening);
      sendResponse({ isListening: isListening });
      return true; // 表示异步响应
      
    case 'START_LISTENING_ALL_TABS':
      // 向所有标签页发送开始监听消息
      chrome.tabs.query({}, (tabs) => {
        console.log('[API捕获器] 向所有标签页发送开始监听消息');
        tabs.forEach(tab => {
          chrome.tabs.sendMessage(tab.id, { type: 'START_LISTENING' }).catch(() => {
            // 某些标签页可能没有content script，忽略错误
          });
        });
        
        // 更新监听状态并保存到storage
        isListening = true;
        chrome.storage.local.set({ isListening: true }).then(() => {
          console.log('[API捕获器] 监听状态已保存: true');
          
          // 广播状态变化消息
          broadcastStatusChange(true);
          
          sendResponse({ success: true });
        }).catch(err => {
          console.error('[API捕获器] 保存监听状态失败:', err);
          sendResponse({ success: false, error: err.message });
        });
      });
      return true; // 表示异步响应
      
    case 'STOP_LISTENING_ALL_TABS':
      // 向所有标签页发送停止监听消息
      chrome.tabs.query({}, (tabs) => {
        console.log('[API捕获器] 向所有标签页发送停止监听消息');
        tabs.forEach(tab => {
          chrome.tabs.sendMessage(tab.id, { type: 'STOP_LISTENING' }).catch(() => {
            // 某些标签页可能没有content script，忽略错误
          });
        });
        
        // 更新监听状态并保存到storage
        isListening = false;
        chrome.storage.local.set({ isListening: false }).then(() => {
          console.log('[API捕获器] 监听状态已保存: false');
          
          // 广播状态变化消息
          broadcastStatusChange(false);
          
          sendResponse({ success: true });
        }).catch(err => {
          console.error('[API捕获器] 保存监听状态失败:', err);
          sendResponse({ success: false, error: err.message });
        });
      });
      return true; // 表示异步响应
      
    default:
      // 对于未知消息类型，不返回true
      console.log('[API捕获器] Background未知消息类型:', message.type);
      return false;
  }
});

// 插件启动时从storage加载数据
chrome.runtime.onStartup.addListener(() => {
  console.log('[API捕获器] 插件启动，加载存储的数据');
  loadStoredRequests();
});

chrome.runtime.onInstalled.addListener(() => {
  console.log('[API捕获器] 插件安装/更新，加载存储的数据');
  loadStoredRequests();
});

// 从storage加载数据
function loadStoredRequests() {
  chrome.storage.local.get(['capturedRequests', 'isListening']).then(result => {
    if (result.capturedRequests) {
      allCapturedRequests = result.capturedRequests;
      console.log('[API捕获器] 加载了存储的请求:', allCapturedRequests.length);
    } else {
      console.log('[API捕获器] 没有找到存储的请求');
    }
    
    // 加载监听状态
    if (result.isListening !== undefined) {
      isListening = result.isListening;
      console.log('[API捕获器] 加载了监听状态:', isListening);
    } else {
      console.log('[API捕获器] 没有找到存储的监听状态，默认为false');
      isListening = false;
    }
  }).catch(err => {
    console.error('[API捕获器] 加载存储数据失败:', err);
  });
}

// 广播状态变化消息
function broadcastStatusChange(newStatus) {
  console.log('[API捕获器] 广播状态变化:', newStatus);
  
  // 发送消息给popup（如果打开着）
  chrome.runtime.sendMessage({
    type: 'STATUS_CHANGED',
    isListening: newStatus
  }).catch(() => {
    // popup可能没有打开，忽略错误
    console.log('[API捕获器] Popup未打开，无法发送状态变化消息');
  });
}

// 初始化时加载数据
loadStoredRequests(); 