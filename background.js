console.log('[API捕获器] 🚀 webRequest版本 Background Script已加载');

// 数据存储
let allCapturedRequests = [];
let clickRecords = []; // 存储点击记录
let isListening = false;
let captureWindow = null;

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

// 查找匹配的点击记录
function findMatchingClick(requestDetails) {
  const requestTime = Date.now();
  const timeWindow = 8000; // 8秒时间窗口
  const multiRequestWindow = 10000; // 10秒内允许多个请求匹配同一个点击
  
  console.log(`[API捕获器] 🔍 查找匹配的点击记录 - 当前时间: ${requestTime}`);
  console.log(`[API捕获器] 📚 当前点击记录 (${clickRecords.length}):`, clickRecords.map(c => ({
    tabId: c.tabId, 
    time: c.timestamp, 
    processed: c.processed, 
    matchCount: c.matchCount || 0
  })));
  
  // 查找时间窗口内的点击记录（取消tabId匹配限制）
  const matchingClicks = clickRecords.filter(click => {
    const timeDiff = requestTime - click.timestamp;
    const withinWindow = timeDiff >= 0 && timeDiff <= timeWindow;
    // 移除 tabId 匹配限制，任何标签页的点击都可以匹配
    // const sameTab = click.tabId === requestDetails.tabId;
    
    // 允许在多请求时间窗口内的点击记录被重复使用
    const canReuse = !click.processed || (timeDiff <= multiRequestWindow);
    
    return withinWindow && canReuse;
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
    
    console.log('[API捕获器] 🎯 找到匹配的点击记录（无tabId限制）:', {
      clickTime: latestClick.timestamp,
      requestTime: requestTime,
      timeDiff: timeDiff,
      element: latestClick.element.tagName,
      matchCount: latestClick.matchCount,
      processed: latestClick.processed,
      clickTabId: latestClick.tabId,
      requestTabId: requestDetails.tabId
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
    if (!isListening) return;
    
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
      
      sendResponse({ success: true });
      break;
      
    case 'GET_ALL_REQUESTS':
      console.log('[API捕获器] 📨 返回所有请求，数量:', allCapturedRequests.length);
      sendResponse({ requests: allCapturedRequests });
      break;
      
    case 'CLEAR_ALL_REQUESTS':
      allCapturedRequests = [];
      clickRecords = [];
      chrome.storage.local.set({ capturedRequests: [] }).then(() => {
        console.log('[API捕获器] 🧹 已清空所有数据');
        sendResponse({ success: true });
      }).catch(err => {
        console.error('[API捕获器] ❌ 清空失败:', err);
        sendResponse({ success: false, error: err.message });
      });
      return true;
      
    case 'GET_LISTENING_STATUS':
      sendResponse({ isListening: isListening });
      break;
      
    case 'START_LISTENING_ALL_TABS':
      // 向所有标签页发送开始监听消息
      chrome.tabs.query({}, (tabs) => {
        console.log(`[API捕获器] 🎧 向 ${tabs.length} 个标签页发送开始监听消息`);
        tabs.forEach(tab => {
          console.log(`[API捕获器] 📤 发送START_LISTENING到标签页 ${tab.id}: ${tab.url}`);
          chrome.tabs.sendMessage(tab.id, { type: 'START_LISTENING' }).then(() => {
            console.log(`[API捕获器] ✅ 标签页 ${tab.id} 监听已启动`);
          }).catch(err => {
          });
        });
        
        isListening = true;
        chrome.storage.local.set({ isListening: true }).then(() => {
          console.log('[API捕获器] ✅ 监听状态已保存');
          sendResponse({ success: true });
        }).catch(err => {
          console.error('[API捕获器] ❌ 保存监听状态失败:', err);
          sendResponse({ success: false, error: err.message });
        });
      });
      return true;
      
    case 'STOP_LISTENING_ALL_TABS':
      // 向所有标签页发送停止监听消息
      chrome.tabs.query({}, (tabs) => {
        console.log('[API捕获器] 🔇 向所有标签页发送停止监听消息');
        tabs.forEach(tab => {
          chrome.tabs.sendMessage(tab.id, { type: 'STOP_LISTENING' }).catch(() => {
            // 忽略错误
          });
        });
        
        isListening = false;
        chrome.storage.local.set({ isListening: false }).then(() => {
          console.log('[API捕获器] ✅ 监听状态已保存');
          sendResponse({ success: true });
        }).catch(err => {
          console.error('[API捕获器] ❌ 保存监听状态失败:', err);
          sendResponse({ success: false, error: err.message });
        });
      });
      return true;
      
    case 'OPEN_CAPTURE_WINDOW':
      if (captureWindow) {
        chrome.windows.update(captureWindow.id, { focused: true }).then(() => {
          sendResponse({ success: true });
        }).catch(() => {
          createCaptureWindow(sendResponse);
        });
      } else {
        createCaptureWindow(sendResponse);
      }
      return true;
      
    default:
      console.log('[API捕获器] ❓ 未知消息类型:', message.type);
      sendResponse({ success: false, error: 'Unknown message type' });
      break;
  }
});

// 创建捕获窗口
function createCaptureWindow(sendResponse) {
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
      sendResponse({ success: true });
    }).catch(err => {
      console.error('[API捕获器] ❌ 创建窗口失败:', err);
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
chrome.storage.local.get(['capturedRequests', 'isListening']).then(result => {
  if (result.capturedRequests) {
    allCapturedRequests = result.capturedRequests;
    console.log('[API捕获器] 📂 加载了存储的请求:', allCapturedRequests.length);
  }
  
  if (result.isListening !== undefined) {
    isListening = result.isListening;
    console.log('[API捕获器] 📂 加载了监听状态:', isListening);
  }
}).catch(err => {
  console.error('[API捕获器] ❌ 加载存储数据失败:', err);
});

// 定期清理过期的点击记录
setInterval(cleanExpiredClicks, 5000); // 每5秒清理一次

// 定期报告状态（调试用）
setInterval(() => {
  console.log(`[API捕获器] 💓 Background Script状态报告:`);
  console.log(`  - 监听状态: ${isListening}`);
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