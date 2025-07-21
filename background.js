console.log('[API捕获器] 🚀 webRequest版本 Background Script已加载');

// 数据存储
let allCapturedRequests = [];
let clickRecords = []; // 存储点击记录
let captureWindow = null;

// 标签页监听状态管理
let tabListeningStates = new Map(); // Map<tabId, {isListening: boolean, startTime: number}>
let globalListening = false; // 全局监听开关

// 点击记录数据结构
// {
//   timestamp: number,
//   element: object,
//   pageUrl: string,
//   tabId: number,
//   processed: boolean
// }

// 清理过期的点击记录
function cleanExpiredClicks() {
  const now = Date.now();
  const expiredTime = 10000; // 10秒过期
  
  const beforeCount = clickRecords.length;
  clickRecords = clickRecords.filter(click => (now - click.timestamp) < expiredTime);
  
  if (beforeCount !== clickRecords.length) {
    console.log('[API捕获器] 🧹 清理过期点击记录:', beforeCount, '->', clickRecords.length);
  }
}

// 检查标签页是否在监听状态
function isTabListening(tabId) {
  if (!globalListening) return false;
  
  const tabState = tabListeningStates.get(tabId);
  return tabState && tabState.isListening;
}

// 获取标签页监听开始时间
function getTabListeningStartTime(tabId) {
  const tabState = tabListeningStates.get(tabId);
  return tabState ? tabState.startTime : 0;
}

// 查找匹配的点击记录
function findMatchingClick(requestDetails) {
  const requestTime = Date.now();
  const timeWindow = 15000; // 15秒时间窗口（扩大时间窗口）
  const multiRequestWindow = 20000; // 20秒内允许多个请求匹配同一个点击
  
  // 检查请求的标签页是否在监听状态
  if (!isTabListening(requestDetails.tabId)) {
    console.log(`[API捕获器] ❌ 标签页 ${requestDetails.tabId} 未开启监听，忽略请求`);
    return null;
  }
  
  const tabStartTime = getTabListeningStartTime(requestDetails.tabId);
  console.log(`[API捕获器] 🔍 查找匹配的点击记录 - 标签页 ${requestDetails.tabId}, 监听开始时间: ${tabStartTime}`);
  
  // 如果没有点击记录，创建一个虚拟的点击记录（用于webRequest-only模式）
  if (clickRecords.length === 0) {
    console.log(`[API捕获器] 📝 没有点击记录，创建虚拟点击记录（webRequest模式）`);
    const virtualClick = {
      timestamp: tabStartTime,
      element: {
        tagName: 'VIRTUAL',
        className: 'webRequest-mode',
        id: 'auto-capture',
        textContent: 'WebRequest Auto Capture'
      },
      pageUrl: requestDetails.url,
      tabId: requestDetails.tabId,
      processed: false,
      virtual: true
    };
    clickRecords.push(virtualClick);
  }
  
  // 只查找该标签页且在监听开始后的点击记录
  const matchingClicks = clickRecords.filter(click => {
    const timeDiff = requestTime - click.timestamp;
    const withinWindow = timeDiff >= 0 && timeDiff <= timeWindow;
    const sameTab = click.tabId === requestDetails.tabId; // 恢复标签页匹配
    const afterListeningStart = click.timestamp >= tabStartTime; // 确保点击在监听开始之后
    
    // 允许在多请求时间窗口内的点击记录被重复使用
    const canReuse = !click.processed || (timeDiff <= multiRequestWindow);
    
    return withinWindow && sameTab && afterListeningStart && canReuse;
  });
  
  if (matchingClicks.length > 0) {
    // 选择最近的点击记录
    const latestClick = matchingClicks.reduce((latest, current) => 
      current.timestamp > latest.timestamp ? current : latest
    );
    
    // 增加匹配计数，但不立即标记为已处理
    latestClick.matchCount = (latestClick.matchCount || 0) + 1;
    
    // 只有在超过多请求时间窗口后才标记为已处理
    const timeDiff = requestTime - latestClick.timestamp;
    if (timeDiff > multiRequestWindow) {
      latestClick.processed = true;
    }
    
    console.log('[API捕获器] 🎯 找到匹配的点击记录:', {
      clickTime: latestClick.timestamp,
      requestTime: requestTime,
      timeDiff: timeDiff,
      element: latestClick.element.tagName,
      matchCount: latestClick.matchCount,
      processed: latestClick.processed,
      tabId: latestClick.tabId
    });
    
    return latestClick;
  }
  
  console.log('[API捕获器] ⏰ 未找到匹配的点击记录');
  return null;
}

// 判断是否是相关的API请求
function isRelevantRequest(details) {
  const url = details.url;
  
  // 排除静态资源
  if (url.match(/\.(css|js|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|eot|pdf|zip)$/i)) {
    return false;
  }
  
  // 排除扩展请求
  if (url.startsWith('chrome-extension://')) {
    return false;
  }
  
  // 排除浏览器内部请求
  if (url.startsWith('chrome://') || url.startsWith('edge://') || url.startsWith('about:')) {
    return false;
  }
  
  // 排除data和blob URL
  if (url.startsWith('data:') || url.startsWith('blob:')) {
    return false;
  }
  
  // 只关注XHR和fetch请求
  if (details.type && !['xmlhttprequest', 'fetch'].includes(details.type)) {
    return false;
  }
  
  return true;
}

// 解析请求体数据
function parseRequestBody(requestBody) {
  if (!requestBody || !requestBody.raw) {
    return null;
  }
  
  try {
    // 合并所有数据块
    let bodyData = '';
    requestBody.raw.forEach(chunk => {
      if (chunk.bytes) {
        // 将ArrayBuffer转换为字符串
        const decoder = new TextDecoder();
        bodyData += decoder.decode(chunk.bytes);
      }
    });
    
    if (!bodyData) return null;
    
    // 尝试解析JSON
    try {
      return JSON.parse(bodyData);
    } catch (e) {
      // 尝试解析URLSearchParams
      if (bodyData.includes('=')) {
        const params = new URLSearchParams(bodyData);
        return Object.fromEntries(params);
      }
      
      // 返回原始字符串
      return bodyData;
    }
  } catch (error) {
    console.error('[API捕获器] ❌ 解析请求体失败:', error);
    return null;
  }
}

// 提取URL路径（不含域名）
function getUrlPath(url) {
  try {
    const urlObj = new URL(url);
    return urlObj.pathname + urlObj.search;
  } catch (e) {
    return url;
  }
}

// webRequest API - 拦截请求
chrome.webRequest.onBeforeRequest.addListener(
  function(details) {
    // 检查全局监听状态和具体标签页状态
    if (!globalListening || !isTabListening(details.tabId)) {
      return;
    }
    
    console.log('[API捕获器] 🌐 webRequest拦截到请求:', details.method, details.url, 'Type:', details.type);
    
    // 判断是否是相关请求
    if (!isRelevantRequest(details)) {
      console.log('[API捕获器] ⏭️ 跳过不相关请求:', details.url);
      return;
    }
    
    // 查找匹配的点击记录
    const matchingClick = findMatchingClick(details);
    
    if (matchingClick) {
      console.log('[API捕获器] ✅ 匹配成功，准备捕获请求');
      
      // 解析请求体
      const parsedBody = parseRequestBody(details.requestBody);
      
      // 创建捕获的请求对象
      const capturedRequest = {
        id: Date.now() + Math.random(),
        timestamp: Date.now(),
        method: details.method,
        url: details.url,
        urlPath: getUrlPath(details.url),
        type: 'webRequest',
        requestBody: parsedBody,
        parsedData: parsedBody,
        headers: {}, // 将在onBeforeSendHeaders中填充
        clickInfo: {
          element: matchingClick.element,
          clickTime: matchingClick.timestamp,
          timeSinceClick: Date.now() - matchingClick.timestamp,
          pageUrl: matchingClick.pageUrl
        },
        tabId: details.tabId,
        capturedAt: new Date().toISOString()
      };
      
      // 存储请求
      allCapturedRequests.push(capturedRequest);
      console.log('[API捕获器] 📝 请求已捕获，总数:', allCapturedRequests.length);
      
      // 限制存储数量
      if (allCapturedRequests.length > 100) {
        allCapturedRequests = allCapturedRequests.slice(-100);
      }
      
      // 保存到storage
      chrome.storage.local.set({
        capturedRequests: allCapturedRequests
      }).then(() => {
        console.log('[API捕获器] ✅ 请求已保存到storage');
      }).catch(err => {
        console.error('[API捕获器] ❌ 保存失败:', err);
      });
      
      // 通知UI更新
      chrome.runtime.sendMessage({
        type: 'REQUEST_UPDATED',
        requestCount: allCapturedRequests.length
      }).catch(() => {
        console.log('[API捕获器] 📢 无法发送更新通知');
      });
      
    } else {
      console.log('[API捕获器] ⏰ 未找到匹配的点击记录，忽略请求');
    }
  },
  {urls: ["<all_urls>"]},
  ["requestBody"]
);

// 监听消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('[API捕获器] 📨 Background收到消息:', message.type);
  
  // 确保sendResponse总是被调用
  let responseHandled = false;
  
  const safeResponse = (response) => {
    if (!responseHandled) {
      responseHandled = true;
      try {
        sendResponse(response);
      } catch (err) {
        console.warn('[API捕获器] ⚠️ 发送响应失败:', err);
      }
    }
  };
  
  // 设置超时保护
  const responseTimeout = setTimeout(() => {
    if (!responseHandled) {
      console.warn('[API捕获器] ⏰ 消息处理超时:', message.type);
      safeResponse({ success: false, error: 'Message handling timeout' });
    }
  }, 10000); // 10秒超时
  
  try {
    switch (message.type) {
    case 'CLICK_RECORDED':
      // 记录点击事件
      const clickRecord = {
        ...message.data,
        tabId: sender.tab?.id,
        processed: false
      };
      
      clickRecords.push(clickRecord);
      console.log('[API捕获器] 🖱️ 点击记录已保存:', clickRecord.element.tagName, '总数:', clickRecords.length);
      
      // 清理过期记录
      cleanExpiredClicks();
      
      clearTimeout(responseTimeout);
      safeResponse({ success: true });
      break;
      
    case 'GET_ALL_REQUESTS':
      console.log('[API捕获器] 📨 返回所有请求，数量:', allCapturedRequests.length);
      clearTimeout(responseTimeout);
      safeResponse({ requests: allCapturedRequests });
      break;
      
    case 'CLEAR_ALL_REQUESTS':
      allCapturedRequests = [];
      clickRecords = [];
      chrome.storage.local.set({ capturedRequests: [] }).then(() => {
        console.log('[API捕获器] 🧹 已清空所有数据');
        clearTimeout(responseTimeout);
        safeResponse({ success: true });
      }).catch(err => {
        console.error('[API捕获器] ❌ 清空失败:', err);
        clearTimeout(responseTimeout);
        safeResponse({ success: false, error: err.message });
      });
      break;
      
    case 'GET_LISTENING_STATUS':
      // 获取当前活动标签页的监听状态
      chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
        if (tabs.length > 0) {
          const activeTabId = tabs[0].id;
          const isActiveTabListening = isTabListening(activeTabId);
          clearTimeout(responseTimeout);
          safeResponse({ 
            isListening: isActiveTabListening,
            globalListening: globalListening,
            activeTabId: activeTabId,
            listeningTabs: Array.from(tabListeningStates.keys())
          });
        } else {
          clearTimeout(responseTimeout);
          safeResponse({ 
            isListening: false,
            globalListening: globalListening,
            listeningTabs: Array.from(tabListeningStates.keys())
          });
        }
      });
      break;
      
    case 'START_LISTENING_ALL_TABS':
      // 只向当前激活的标签页发送开始监听消息
      chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
        if (tabs.length === 0) {
          console.log('[API捕获器] ❌ 未找到活动标签页');
          clearTimeout(responseTimeout);
          safeResponse({ success: false, error: 'No active tab found' });
          return;
        }
        
        const activeTab = tabs[0];
        const tabUrl = activeTab.url || 'about:blank';
        console.log(`[API捕获器] 🎧 向活动标签页 ${activeTab.id} 发送开始监听消息: ${tabUrl}`);
        
        // 检查标签页URL是否支持content script
        if (!activeTab.url || 
            tabUrl.startsWith('chrome://') || 
            tabUrl.startsWith('chrome-extension://') || 
            tabUrl.startsWith('edge://') || 
            tabUrl.startsWith('about:') ||
            tabUrl.startsWith('moz-extension://') ||
            tabUrl === 'about:blank') {
          console.log(`[API捕获器] ❌ 标签页 ${activeTab.id} 不支持content script: ${tabUrl}`);
          clearTimeout(responseTimeout);
          safeResponse({ success: false, error: 'This page does not support content scripts. Please navigate to a regular website.' });
          return;
        }
        
        // 先尝试注入content script（以防万一没有加载）
        chrome.scripting.executeScript({
          target: { tabId: activeTab.id },
          files: ['content-new.js']
        }).then(() => {
          console.log(`[API捕获器] ✅ Content script已注入到标签页 ${activeTab.id}`);
          
          // 等待一小段时间让content script初始化
          setTimeout(() => {
            sendMessageToTab(activeTab.id);
          }, 500);
          
        }).catch(scriptError => {
          console.log(`[API捕获器] ⚠️ 注入content script失败，尝试直接发送消息:`, scriptError);
          sendMessageToTab(activeTab.id);
        });
        
        function sendMessageToTab(tabId) {
          // 设置超时机制
          const messageTimeout = setTimeout(() => {
            console.warn(`[API捕获器] ⏰ 向标签页 ${tabId} 发送消息超时，切换到webRequest模式`);
            activateWebRequestMode(tabId);
          }, 3000); // 3秒超时
          
          chrome.tabs.sendMessage(tabId, { type: 'START_LISTENING' }).then(() => {
            clearTimeout(messageTimeout);
            console.log(`[API捕获器] ✅ 标签页 ${tabId} 监听已启动`);
            
            // 设置该标签页的监听状态
            tabListeningStates.set(tabId, {
              isListening: true,
              startTime: Date.now()
            });
            
            globalListening = true;
            
            chrome.storage.local.set({ 
              isListening: true,
              activeListeningTabId: tabId 
            }).then(() => {
              console.log('[API捕获器] ✅ 监听状态已保存');
              clearTimeout(responseTimeout);
              safeResponse({ success: true, activeTabId: tabId });
            }).catch(err => {
              console.error('[API捕获器] ❌ 保存监听状态失败:', err);
              clearTimeout(responseTimeout);
              safeResponse({ success: false, error: err.message });
            });
            
          }).catch(err => {
            clearTimeout(messageTimeout);
            console.error(`[API捕获器] ❌ 向标签页 ${tabId} 发送消息失败:`, err);
            activateWebRequestMode(tabId);
          });
        }
        
        function activateWebRequestMode(tabId) {
          // 如果发送消息失败，仍然设置监听状态（webRequest方式不依赖content script）
          console.log(`[API捕获器] 🔄 Content script不可用，使用webRequest方式监听`);
          
          tabListeningStates.set(tabId, {
            isListening: true,
            startTime: Date.now()
          });
          
          globalListening = true;
          
          chrome.storage.local.set({ 
            isListening: true,
            activeListeningTabId: tabId 
          }).then(() => {
            console.log('[API捕获器] ✅ 已启用webRequest监听模式');
            clearTimeout(responseTimeout);
            safeResponse({ 
              success: true, 
              activeTabId: tabId,
              mode: 'webRequest',
              warning: 'Content script unavailable, using webRequest mode only'
            });
          }).catch(err => {
            console.error('[API捕获器] ❌ 保存监听状态失败:', err);
            clearTimeout(responseTimeout);
            safeResponse({ success: false, error: err.message });
          });
        }
      });
      return true;
      
    case 'STOP_LISTENING_ALL_TABS':
      // 停止所有标签页的监听
      console.log('[API捕获器] 🔇 停止所有标签页监听');
      
      // 向所有正在监听的标签页发送停止消息
      for (const [tabId, tabState] of tabListeningStates.entries()) {
        if (tabState.isListening) {
          chrome.tabs.sendMessage(tabId, { type: 'STOP_LISTENING' }).catch(() => {
            console.log(`[API捕获器] 标签页 ${tabId} 可能已关闭`);
          });
        }
      }
      
      // 清空所有标签页监听状态
      tabListeningStates.clear();
      globalListening = false;
      
      chrome.storage.local.set({ 
        isListening: false,
        activeListeningTabId: null 
      }).then(() => {
        console.log('[API捕获器] ✅ 监听状态已清空');
        clearTimeout(responseTimeout);
        safeResponse({ success: true });
      }).catch(err => {
        console.error('[API捕获器] ❌ 保存监听状态失败:', err);
        clearTimeout(responseTimeout);
        safeResponse({ success: false, error: err.message });
      });
      break;
      
    case 'OPEN_CAPTURE_WINDOW':
      if (captureWindow) {
        chrome.windows.update(captureWindow.id, { focused: true }).then(() => {
          clearTimeout(responseTimeout);
          safeResponse({ success: true });
        }).catch(() => {
          createCaptureWindow(safeResponse, responseTimeout);
        });
      } else {
        createCaptureWindow(safeResponse, responseTimeout);
      }
      break;
      
    default:
      console.log('[API捕获器] ❓ 未知消息类型:', message.type);
      clearTimeout(responseTimeout);
      safeResponse({ success: false, error: 'Unknown message type' });
      break;
    }
  } catch (error) {
    console.error('[API捕获器] ❌ 消息处理异常:', error);
    clearTimeout(responseTimeout);
    safeResponse({ success: false, error: error.message });
  }
  
  return true; // 表示异步响应
});

// 创建捕获窗口
function createCaptureWindow(sendResponse, responseTimeout = null) {
  // 获取当前屏幕信息
  chrome.system.display.getInfo((displays) => {
    const primaryDisplay = displays.find(d => d.isPrimary) || displays[0];
    const screenWidth = primaryDisplay.workArea.width;
    const screenHeight = primaryDisplay.workArea.height;
    
    // 计算右上角位置
    const windowWidth = 320;
    const windowHeight = 360;
    const left = screenWidth - windowWidth - 20; // 距离右边缘20px
    const top = 20; // 距离顶部20px
    
    chrome.windows.create({
      url: chrome.runtime.getURL('window.html'),
      type: 'popup',
      width: windowWidth,
      height: windowHeight,
      focused: true,
      left: left,
      top: top
    }).then(window => {
      captureWindow = window;
      console.log('[API捕获器] ✅ 捕获窗口已创建');
      if (responseTimeout) clearTimeout(responseTimeout);
      sendResponse({ success: true });
    }).catch(err => {
      console.error('[API捕获器] ❌ 创建窗口失败:', err);
      if (responseTimeout) clearTimeout(responseTimeout);
      sendResponse({ success: false, error: err.message });
    });
  });
}

// 监听窗口关闭
chrome.windows.onRemoved.addListener((windowId) => {
  if (captureWindow && windowId === captureWindow.id) {
    console.log('[API捕获器] 🪟 捕获窗口已关闭');
    captureWindow = null;
  }
});

// 监听扩展图标点击
chrome.action.onClicked.addListener(async (tab) => {
  console.log('[API捕获器] 🖱️ 扩展图标被点击');
  
  try {
    if (captureWindow) {
      try {
        await chrome.windows.update(captureWindow.id, { focused: true });
        console.log('[API捕获器] ✅ 聚焦到现有窗口');
        return;
      } catch (err) {
        console.log('[API捕获器] 现有窗口不存在，创建新窗口');
        captureWindow = null;
      }
    }
    
    // 获取屏幕信息来计算右上角位置
    const displays = await new Promise((resolve) => {
      chrome.system.display.getInfo(resolve);
    });
    
    const primaryDisplay = displays.find(d => d.isPrimary) || displays[0];
    const screenWidth = primaryDisplay.workArea.width;
    const windowWidth = 320;
    const windowHeight = 360;
    const left = screenWidth - windowWidth - 20; // 距离右边缘20px
    const top = 20; // 距离顶部20px
    
    captureWindow = await chrome.windows.create({
      url: 'window.html',
      type: 'popup',
      width: windowWidth,
      height: windowHeight,
      focused: true,
      left: left,
      top: top
    });
    
    console.log('[API捕获器] ✅ 独立窗口已创建');
    
  } catch (error) {
    console.error('[API捕获器] ❌ 创建独立窗口失败:', error);
  }
});

// 初始化时加载数据
chrome.storage.local.get(['capturedRequests', 'isListening', 'activeListeningTabId']).then(result => {
  if (result.capturedRequests) {
    allCapturedRequests = result.capturedRequests;
    console.log('[API捕获器] 📂 加载了存储的请求:', allCapturedRequests.length);
  }
  
  if (result.isListening && result.activeListeningTabId) {
    // 检查之前监听的标签页是否仍然存在
    chrome.tabs.get(result.activeListeningTabId).then(tab => {
      if (tab) {
        console.log(`[API捕获器] 📂 恢复标签页 ${tab.id} 的监听状态`);
        tabListeningStates.set(tab.id, {
          isListening: true,
          startTime: Date.now() // 重新设置开始时间
        });
        globalListening = true;
      }
    }).catch(() => {
      console.log('[API捕获器] 📂 之前监听的标签页已不存在，重置状态');
      chrome.storage.local.set({ isListening: false, activeListeningTabId: null });
    });
  }
}).catch(err => {
  console.error('[API捕获器] ❌ 加载存储数据失败:', err);
});

// 定期清理过期的点击记录
setInterval(cleanExpiredClicks, 5000); // 每5秒清理一次

// 定期清理已关闭标签页的监听状态
chrome.tabs.onRemoved.addListener((tabId) => {
  if (tabListeningStates.has(tabId)) {
    console.log(`[API捕获器] 🗑️ 清理已关闭标签页 ${tabId} 的监听状态`);
    tabListeningStates.delete(tabId);
    
    // 如果没有标签页在监听，关闭全局监听
    if (tabListeningStates.size === 0) {
      globalListening = false;
      chrome.storage.local.set({ isListening: false });
    }
  }
});

// 定期报告状态（调试用）
setInterval(() => {
  console.log(`[API捕获器] 💓 Background Script状态报告:`);
  console.log(`  - 全局监听状态: ${globalListening}`);
  console.log(`  - 监听中的标签页: ${Array.from(tabListeningStates.keys()).join(', ')}`);
  console.log(`  - 点击记录数量: ${clickRecords.length}`);
  console.log(`  - 捕获请求数量: ${allCapturedRequests.length}`);
  if (clickRecords.length > 0) {
    console.log(`  - 最近的点击记录:`, clickRecords.slice(-3).map(c => ({
      tabId: c.tabId,
      timestamp: c.timestamp,
      processed: c.processed,
      element: c.element.tagName
    })));
  }
}, 15000); // 每15秒报告一次

console.log('[API捕获器] 🎉 webRequest版本 Background Script初始化完成'); 