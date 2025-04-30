/**
 * AI Chatbot Servis Katmanı
 * METS uygulaması için AI sohbet asistanı servisi
 */

import { ref } from 'vue';
import { useAuthStore, useNotificationStore, useTechnicalStore } from '@/store';
import { useToast } from '@/composables/useToast';
import logger from '@/utils/logger';
import { useOrderService } from '@/services/order-service';
import { useMaterialService } from '@/services/material-service';
import { useErpService } from '@/services/erp-service';

// Pinia store referansları
let authStore;
let notificationStore;
let technicalStore;

// Service referansları
let orderService;
let materialService;
let erpService;

// Tost bildirimleri için composable
let toast;

// AI durumunu izlemek için reakif değişkenler
const isConnected = ref(false);
const isProcessing = ref(false);
const currentMode = ref('normal'); // normal, advanced, learning
const supportedLanguages = ref(['tr', 'en']);
const currentLanguage = ref('tr');
const hasNewSuggestion = ref(false);

// Öğrenme modu durumu
const learningMode = ref(false);

// Chat geçmişi
const chatHistory = ref([]);

// AI asistanına ait bilgiler
const assistantInfo = {
  name: 'METS AI',
  version: '1.0.0',
  capabilities: [
    'Üretim planlaması',
    'Stok tahmini',
    'Sipariş analizi',
    'Verimlilik önerileri',
    'Teknik destek',
    'Rapor oluşturma'
  ],
  feedbackScore: 4.7
};

// Kullanılabilir AI modları
const aiModes = [
  { id: 'normal', name: 'Normal Mod', icon: 'bi-chat' },
  { id: 'advanced', name: 'Gelişmiş Mod', icon: 'bi-gear' },
  { id: 'learning', name: 'Öğrenme Modu', icon: 'bi-lightbulb' },
  { id: 'report', name: 'Rapor Modu', icon: 'bi-file-earmark-bar-graph' }
];

/**
 * Store ve composable'ları başlat
 */
const initializeStores = () => {
  if (!authStore) authStore = useAuthStore();
  if (!notificationStore) notificationStore = useNotificationStore();
  if (!technicalStore) technicalStore = useTechnicalStore();
  if (!toast) toast = useToast();
  
  // Servisleri başlat
  if (!orderService) orderService = useOrderService();
  if (!materialService) materialService = useMaterialService();
  if (!erpService) erpService = useErpService();
};

/**
 * AI servisini başlatır - initializeAI fonksiyonunu kullanarak initialize takma adını oluştur
 * @returns {Promise<boolean>} Bağlantı durumu
 */
const initialize = async () => {
  return await initializeAI();
};

/**
 * AI servisini başlatır ve bağlantıyı kurar
 * @returns {Promise<boolean>} Bağlantı durumu
 */
const initializeAI = async () => {
  if (isConnected.value) return true;
  
  try {
    isProcessing.value = true;
    
    // Store ve composable'ları başlat
    initializeStores();
    
    await new Promise(resolve => setTimeout(resolve, 1000)); // Bağlantı simülasyonu

    const userRole = authStore.userRole || 'user';
    currentMode.value = userRole === 'admin' || userRole === 'technical' ? 'advanced' : 'normal';
    
    isConnected.value = true;
    isProcessing.value = false;
    
    if (technicalStore) {
      technicalStore.setAIStatus({ connected: true, mode: currentMode.value });
    }
    
    return true;
  } catch (error) {
    logger.error('AI servisi başlatılamadı:', error);
    isProcessing.value = false;
    
    if (toast) {
      toast.error('AI asistanı bağlantısı kurulamadı. Lütfen daha sonra tekrar deneyin.');
    }
    return false;
  }
};

/**
 * AI asistanı ile mesajlaşma
 * @param {string} message - Kullanıcı mesajı
 * @param {object} context - İsteğe bağlı kontekst bilgisi (sipariş, ürün vb.)
 * @returns {Promise<object>} AI yanıtı
 */
const sendMessage = async (message, context = {}) => {
  if (!isConnected.value) {
    const connected = await initializeAI();
    if (!connected) throw new Error('AI servisi bağlı değil');
  }
  
  try {
    isProcessing.value = true;
    
    // Store'ları başlat
    initializeStores();
    
    const messageId = `msg-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    
    const userMessage = {
      id: messageId,
      sender: 'user',
      text: message,
      timestamp: new Date()
    };
    chatHistory.value.push(userMessage);
    
    if (technicalStore) {
      technicalStore.addUserMessage({ text: message, timestamp: new Date() });
    }
    
    const aiResponse = await processUserMessage(message, context);
    
    const aiMessage = {
      id: `msg-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      sender: 'ai',
      text: aiResponse.text,
      timestamp: aiResponse.timestamp,
      mode: currentMode.value,
      suggestions: aiResponse.suggestions || []
    };
    
    if (aiResponse.additionalData) {
      aiMessage.additionalData = aiResponse.additionalData;
    }
    
    chatHistory.value.push(aiMessage);
    
    if (technicalStore) {
      technicalStore.addAIResponse(aiResponse);
    }
    
    if (aiResponse.suggestions && aiResponse.suggestions.length > 0) {
      hasNewSuggestion.value = true;
    }
    
    isProcessing.value = false;
    return aiResponse;
  } catch (error) {
    logger.error('AI mesajı işlenirken hata:', error);
    isProcessing.value = false;
    
    if (toast) {
      toast.error('Mesajınız işlenirken bir hata oluştu.');
    }
    throw error;
  }
};

/**
 * Kullanıcı mesajını işler ve uygun yanıtı oluşturur
 * @param {string} message - Kullanıcı mesajı
 * @param {object} context - Kontekst bilgisi
 * @returns {Promise<object>} AI yanıtı
 */
const processUserMessage = async (message, context = {}) => {
  const lowercaseMsg = message.toLowerCase();
  
  const orderNumberMatch = message.match(/(\d{6,})|([A-Z]{2,}\d+)|#(\d{4}-\d{4})/i);
  const orderNumber = orderNumberMatch ? orderNumberMatch[0].replace('#', '') : null;
  
  const productTypes = ['cb', 'lb', 'fl', 'rmu', 'rm 36'];
  const hasProductType = productTypes.some(type => lowercaseMsg.includes(type));
  
  if (orderNumber || (lowercaseMsg.includes('sipariş') && (lowercaseMsg.includes('durum') || lowercaseMsg.includes('ne') || lowercaseMsg.includes('takip')))) {
    try {
      if (orderNumber) {
        const orderData = await getOrderDetails(orderNumber);
        
        if (orderData) {
          const materialsStatus = await getMaterialsStatusForOrder(orderData.id);
          const productionPlan = await getProductionPlanForOrder(orderData.id);
          
          return createOrderResponse(orderData, materialsStatus, productionPlan);
        } else {
          return {
            text: `${orderNumber} numaralı siparişi sistemde bulamadım. Lütfen sipariş numarasını kontrol ediniz.`,
            timestamp: new Date(),
            suggestions: [
              'Son siparişleri göster',
              'Aktif siparişleri listele'
            ]
          };
        }
      } else {
        return {
          text: 'Sipariş durumu hakkında bilgi almak için sipariş numarasını belirtmeniz gerekiyor. Hangi siparişin durumunu öğrenmek istersiniz?',
          timestamp: new Date(),
          suggestions: [
            'Son siparişlerimi göster',
            'Geciken siparişleri listele',
            'Bu haftaki teslimatları göster'
          ]
        };
      }
    } catch (error) {
      logger.error('Sipariş sorgusu işlenirken hata:', error);
      return {
        text: 'Sipariş bilgileri alınırken bir sorun oluştu. Lütfen daha sonra tekrar deneyiniz.',
        timestamp: new Date(),
        suggestions: [
          'Sipariş listesini göster',
          'Sistemdeki hataları kontrol et'
        ]
      };
    }
  }
  
  if (lowercaseMsg.includes('stok') || lowercaseMsg.includes('malzeme') || lowercaseMsg.includes('envanter')) {
    try {
      if (lowercaseMsg.includes('kritik') || lowercaseMsg.includes('düşük') || lowercaseMsg.includes('az')) {
        const criticalMaterials = await getCriticalMaterials();
        return createMaterialsResponse(criticalMaterials, 'critical');
      } else if (lowercaseMsg.match(/[a-z0-9]+-\d+/i)) {
        const materialCode = lowercaseMsg.match(/[a-z0-9]+-\d+/i)[0];
        const materialInfo = await getMaterialInfo(materialCode);
        
        if (materialInfo) {
          return createMaterialDetailResponse(materialInfo);
        } else {
          return {
            text: `${materialCode} kodlu malzemeyi sistemde bulamadım. Lütfen malzeme kodunu kontrol ediniz.`,
            timestamp: new Date(),
            suggestions: [
              'Kritik stok seviyesindeki malzemeleri göster',
              'Stok durumu raporu oluştur'
            ]
          };
        }
      } else {
        const stockSummary = await getStockSummary();
        return createStockSummaryResponse(stockSummary);
      }
    } catch (error) {
      logger.error('Stok sorgusu işlenirken hata:', error);
      return {
        text: 'Stok bilgileri alınırken bir sorun oluştu. Lütfen daha sonra tekrar deneyiniz.',
        timestamp: new Date(),
        suggestions: [
          'Stok durumunu göster',
          'Malzeme listesini göster'
        ]
      };
    }
  }
  
  if (lowercaseMsg.includes('üretim') || lowercaseMsg.includes('planlama') || lowercaseMsg.includes('imalat')) {
    try {
      if (lowercaseMsg.includes('bugün') || lowercaseMsg.includes('günlük')) {
        const dailyPlan = await getProductionPlan('daily');
        return createProductionPlanResponse(dailyPlan, 'daily');
      } else if (lowercaseMsg.includes('hafta') || lowercaseMsg.includes('haftalık')) {
        const weeklyPlan = await getProductionPlan('weekly');
        return createProductionPlanResponse(weeklyPlan, 'weekly');
      } else if (lowercaseMsg.includes('ay') || lowercaseMsg.includes('aylık')) {
        const monthlyPlan = await getProductionPlan('monthly');
        return createProductionPlanResponse(monthlyPlan, 'monthly');
      } else if (lowercaseMsg.includes('analiz') || lowercaseMsg.includes('rapor')) {
        const productionAnalysis = await getProductionAnalysis();
        return createProductionAnalysisResponse(productionAnalysis);
      } else {
        const productionSummary = await getProductionSummary();
        return createProductionSummaryResponse(productionSummary);
      }
    } catch (error) {
      logger.error('Üretim sorgusu işlenirken hata:', error);
      return {
        text: 'Üretim bilgileri alınırken bir sorun oluştu. Lütfen daha sonra tekrar deneyiniz.',
        timestamp: new Date(),
        suggestions: [
          'Üretim planını göster',
          'Üretim sorunlarını listele'
        ]
      };
    }
  }
  
  return generateAIResponse(message, context);
};

/**
 * Sipariş detaylarını getirir
 * @param {string} orderNumber - Sipariş numarası
 * @returns {Promise<object>} Sipariş detayları
 */
const getOrderDetails = async (orderNumber) => {
  try {
    if (orderService) {
      const order = await orderService.getOrderByNumber(orderNumber);
      return order;
    }
    
    return getMockOrderDetails(orderNumber);
  } catch (error) {
    logger.error(`Sipariş detayları alınırken hata (${orderNumber}):`, error);
    return null;
  }
};

/**
 * Sipariş için malzeme durumunu getirir
 * @param {string} orderId - Sipariş ID'si
 * @returns {Promise<object>} Malzeme durumu
 */
const getMaterialsStatusForOrder = async (orderId) => {
  try {
    if (materialService && orderId) {
      const materials = await materialService.getMaterialsForOrder(orderId);
      return materials;
    }
    
    return getMockMaterialsForOrder(orderId);
  } catch (error) {
    logger.error(`Sipariş için malzeme durumu alınırken hata (${orderId}):`, error);
    return [];
  }
};

/**
 * Sipariş için üretim planını getirir
 * @param {string} orderId - Sipariş ID'si
 * @returns {Promise<object>} Üretim planı
 */
const getProductionPlanForOrder = async (orderId) => {
  try {
    if (orderService && orderId) {
      const plan = await orderService.getProductionPlanForOrder(orderId);
      return plan;
    }
    
    return getMockProductionPlanForOrder(orderId);
  } catch (error) {
    logger.error(`Sipariş için üretim planı alınırken hata (${orderId}):`, error);
    return null;
  }
};

/**
 * Kritik stok seviyesindeki malzemeleri getirir
 * @returns {Promise<Array>} Kritik stok malzemeleri
 */
const getCriticalMaterials = async () => {
  try {
    if (materialService) {
      const materials = await materialService.getCriticalMaterials();
      return materials;
    }
    
    return [
      { id: 'M-1001', code: 'M-1001', name: 'Filtre Elemanı A4', currentStock: 2, minLevel: 5, expectedDelivery: '10.05.2025', neededFor: ['order-001', 'order-005'] },
      { id: 'K-2203', code: 'K-2203', name: 'Conta Takımı', currentStock: 0, minLevel: 10, expectedDelivery: '15.05.2025', neededFor: ['order-002', 'order-003'] },
      { id: 'B-4507', code: 'B-4507', name: 'Bağlantı Parçası', currentStock: 3, minLevel: 8, expectedDelivery: '20.05.2025', neededFor: ['order-004'] }
    ];
  } catch (error) {
    logger.error('Kritik malzemeler alınırken hata:', error);
    return [];
  }
};

/**
 * Stok özeti getirir
 * @returns {Promise<object>} Stok özeti
 */
const getStockSummary = async () => {
  try {
    if (materialService) {
      const summary = await materialService.getStockSummary();
      return summary;
    }
    
    return {
      totalMaterials: 1250,
      criticalCount: 42,
      reservedCount: 315,
      stockValue: 1850000,
      recentlyChanged: [
        { id: 'M-1001', code: 'M-1001', name: 'Filtre Elemanı A4', change: -3, date: new Date() },
        { id: 'K-2203', code: 'K-2203', name: 'Conta Takımı', change: +10, date: new Date(Date.now() - 24 * 60 * 60 * 1000) },
        { id: 'B-4507', code: 'B-4507', name: 'Bağlantı Parçası', change: -5, date: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000) }
      ]
    };
  } catch (error) {
    logger.error('Stok özeti alınırken hata:', error);
    return null;
  }
};

/**
 * Üretim planını getirir
 * @param {string} timeframe - Zaman dilimi ('daily', 'weekly', 'monthly')
 * @returns {Promise<object>} Üretim planı
 */
const getProductionPlan = async (timeframe) => {
  try {
    if (timeframe === 'daily') {
      return {
        date: new Date().toLocaleDateString('tr-TR'),
        plannedItems: 12,
        completedItems: 8,
        delayedItems: 2,
        sections: [
          { name: 'Mekanik Üretim', planned: 5, completed: 4, efficiency: 90 },
          { name: 'Elektrik Montaj', planned: 4, completed: 3, efficiency: 85 },
          { name: 'Test', planned: 3, completed: 1, efficiency: 70 }
        ],
        orders: [
          { id: 'order-001', orderNo: '0424-1251', status: 'in_progress', today: 'Elektrik Montaj' },
          { id: 'order-002', orderNo: '0424-1245', status: 'in_progress', today: 'Mekanik Üretim' }
        ]
      };
    } else if (timeframe === 'weekly') {
      return {
        startDate: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toLocaleDateString('tr-TR'),
        endDate: new Date(Date.now() + 4 * 24 * 60 * 60 * 1000).toLocaleDateString('tr-TR'),
        plannedItems: 35,
        completedItems: 18,
        delayedItems: 5,
        departments: [
          { name: 'Mekanik Üretim', planned: 15, completed: 10, efficiency: 85 },
          { name: 'Elektrik Montaj', planned: 12, completed: 6, efficiency: 80 },
          { name: 'Test', planned: 8, completed: 2, efficiency: 75 }
        ],
        topOrders: [
          { id: 'order-001', orderNo: '0424-1251', priority: 'high', progress: 65 },
          { id: 'order-002', orderNo: '0424-1245', priority: 'medium', progress: 40 }
        ]
      };
    } else {
      return {
        month: 'Mayıs 2025',
        plannedItems: 150,
        completedItems: 35,
        delayedItems: 12,
        efficiencyRate: 82,
        productionByType: [
          { type: 'CB', planned: 50, completed: 15 },
          { type: 'LB', planned: 40, completed: 10 },
          { type: 'FL', planned: 35, completed: 8 },
          { type: 'RMU', planned: 25, completed: 2 }
        ]
      };
    }
  } catch (error) {
    logger.error(`Üretim planı alınırken hata (${timeframe}):`, error);
    return null;
  }
};

/**
 * Mock sipariş detaylarını döndürür
 * @param {string} orderNumber - Sipariş numarası
 * @returns {object} Mock sipariş detayları
 */
const getMockOrderDetails = (orderNumber) => {
  const cleanOrderNumber = orderNumber.replace('#', '');
  
  const mockOrders = {
    '0424-1251': {
      id: 'order-001',
      orderNo: '0424-1251',
      orderDate: '2024-04-01',
      customerInfo: {
        name: 'AYEDAŞ',
        documentNo: 'PO-2024-A156',
        contactPerson: 'Ahmet Yılmaz'
      },
      cells: [
        {
          productTypeCode: 'RM 36 CB',
          technicalValues: '36kV 630A 16kA Kesicili ÇIKIŞ Hücresi',
          quantity: 1,
          deliveryDate: '2024-11-15'
        }
      ],
      status: 'delayed',
      progress: 65,
      priority: 'high',
      productionStage: 'Elektrik Montaj',
      problemDescription: 'Tedarikçiden malzeme gecikmesi',
      estimatedCompletion: '20.11.2025',
      createdAt: new Date('2024-04-01'),
      updatedAt: new Date('2024-04-15')
    },
    '0424-1245': {
      id: 'order-002',
      orderNo: '0424-1245',
      orderDate: '2024-04-05',
      customerInfo: {
        name: 'BEDAŞ',
        documentNo: 'PO-2024-B789',
        contactPerson: 'Mehmet Demir'
      },
      cells: [
        {
          productTypeCode: 'RM 36 LB',
          technicalValues: '36kV 630A 16kA Yük Ayırıcılı Giriş Hücresi',
          quantity: 2,
          deliveryDate: '2024-11-20'
        },
        {
          productTypeCode: 'RM 36 CB',
          technicalValues: '36kV 630A 16kA Kesicili ÇIKIŞ Hücresi',
          quantity: 3,
          deliveryDate: '2024-11-20'
        }
      ],
      status: 'in_progress',
      progress: 35,
      priority: 'medium',
      productionStage: 'Mekanik Üretim',
      estimatedCompletion: '15.11.2025',
      createdAt: new Date('2024-04-05'),
      updatedAt: new Date('2024-04-10')
    }
  };
  
  return mockOrders[cleanOrderNumber] || null;
};

/**
 * Mock malzeme listesini döndürür
 * @param {string} orderId - Sipariş ID'si
 * @returns {Array} Mock malzeme listesi
 */
const getMockMaterialsForOrder = (orderId) => {
  const materialsByOrder = {
    'order-001': [
      { id: 'M-1001', code: 'M-1001', name: 'Filtre Elemanı A4', required: 1, inStock: 2, reserved: 1, status: 'available' },
      { id: 'K-2204', code: 'K-2204', name: 'Sigorta Grubu', required: 2, inStock: 0, reserved: 0, status: 'ordered', expectedDelivery: '10.05.2025' },
      { id: 'E-3308', code: 'E-3308', name: 'Kontrol Rölesi', required: 1, inStock: 1, reserved: 1, status: 'available' }
    ],
    'order-002': [
      { id: 'M-1002', code: 'M-1002', name: 'Kesici Modülü', required: 3, inStock: 2, reserved: 2, status: 'partial', missing: 1 },
      { id: 'K-2203', code: 'K-2203', name: 'Conta Takımı', required: 5, inStock: 0, reserved: 0, status: 'critical', expectedDelivery: '15.05.2025' }
    ]
  };
  
  return materialsByOrder[orderId] || [];
};

/**
 * Mock üretim planını döndürür
 * @param {string} orderId - Sipariş ID'si
 * @returns {object} Mock üretim planı
 */
const getMockProductionPlanForOrder = (orderId) => {
  const plansByOrder = {
    'order-001': {
      stages: [
        { name: 'Mekanik Üretim', plannedStart: '05.04.2025', plannedEnd: '15.04.2025', actualStart: '05.04.2025', actualEnd: '18.04.2025', status: 'completed', delay: 3 },
        { name: 'Elektrik Montaj', plannedStart: '16.04.2025', plannedEnd: '26.04.2025', actualStart: '19.04.2025', actualEnd: null, status: 'in_progress', delay: 3 },
        { name: 'Test', plannedStart: '27.04.2025', plannedEnd: '30.04.2025', actualStart: null, actualEnd: null, status: 'pending', delay: 0 }
      ],
      estimatedCompletion: '05.05.2025',
      originalDeadline: '30.04.2025',
      delayReason: 'Mekanik üretimde malzeme eksikliği',
      extraHoursNeeded: 16,
      workersAssigned: ['Ahmet K.', 'Mehmet Y.', 'Ali D.']
    },
    'order-002': {
      stages: [
        { name: 'Mekanik Üretim', plannedStart: '10.04.2025', plannedEnd: '25.04.2025', actualStart: '12.04.2025', actualEnd: null, status: 'in_progress', delay: 2 },
        { name: 'Elektrik Montaj', plannedStart: '26.04.2025', plannedEnd: '10.05.2025', actualStart: null, actualEnd: null, status: 'pending', delay: 0 },
        { name: 'Test', plannedStart: '11.05.2025', plannedEnd: '15.05.2025', actualStart: null, actualEnd: null, status: 'pending', delay: 0 }
      ],
      estimatedCompletion: '15.05.2025',
      originalDeadline: '15.05.2025',
      delayReason: '',
      extraHoursNeeded: 0,
      workersAssigned: ['Mustafa T.', 'Zeynep K.', 'Hasan B.']
    }
  };
  
  return plansByOrder[orderId] || null;
};

/**
 * Sipariş için kapsamlı bir yanıt oluşturur
 * @param {object} orderData - Sipariş verisi
 * @param {Array} materialsStatus - Malzeme durumu
 * @param {object} productionPlan - Üretim planı
 * @returns {object} Oluşturulan yanıt
 */
const createOrderResponse = (orderData, materialsStatus, productionPlan) => {
  let summary = `${orderData.orderNo} numaralı sipariş şu an "${orderData.status === 'delayed' ? 'Gecikiyor' : orderData.status === 'in_progress' ? 'Üretimde' : orderData.status}" durumunda ve %${orderData.progress} tamamlandı.`;
  
  let materialSummary = '';
  const criticalMaterials = materialsStatus.filter(m => m.status === 'critical' || m.status === 'ordered');
  
  if (criticalMaterials.length > 0) {
    materialSummary = `\n\nSipariş için ${criticalMaterials.length} adet kritik malzeme bekliyor:`;
    criticalMaterials.forEach(mat => {
      materialSummary += `\n- ${mat.name}: ${mat.status === 'ordered' ? 'Sipariş edildi' : 'Kritik seviyede'}, Beklenen Teslimat: ${mat.expectedDelivery}`;
    });
  } else if (materialsStatus.some(m => m.status === 'partial')) {
    materialSummary = '\n\nBazı malzemeler kısmen stokta bulunuyor, gereken miktarları tamamlamak için ek sipariş gerekebilir.';
  } else if (materialsStatus.every(m => m.status === 'available')) {
    materialSummary = '\n\nTüm gerekli malzemeler stokta mevcut ve siparişe ayrılmış durumda.';
  }
  
  let productionSummary = '';
  if (productionPlan) {
    const currentStage = productionPlan.stages.find(stage => stage.status === 'in_progress');
    const completedStages = productionPlan.stages.filter(stage => stage.status === 'completed');
    
    if (currentStage) {
      productionSummary = `\n\nŞu an "${currentStage.name}" aşamasında üretim devam ediyor.`;
      
      if (orderData.status === 'delayed') {
        productionSummary += `\nGecikme nedeni: ${productionPlan.delayReason || 'Belirtilmemiş'}`;
        productionSummary += `\nTamamlanabilmesi için gereken ek mesai: ${productionPlan.extraHoursNeeded} saat`;
      }
    }
    
    const estimatedDelivery = productionPlan.estimatedCompletion || orderData.cells[0].deliveryDate;
    productionSummary += `\n\nTahmini teslim tarihi: ${estimatedDelivery}`;
    
    if (productionPlan.originalDeadline && productionPlan.estimatedCompletion !== productionPlan.originalDeadline) {
      productionSummary += ` (Orijinal termin: ${productionPlan.originalDeadline})`;
    }
  }
  
  let cellInfo = '';
  if (orderData.cells && orderData.cells.length > 0) {
    cellInfo = '\n\nSiparişte bulunan hücreler:';
    orderData.cells.forEach(cell => {
      cellInfo += `\n- ${cell.quantity} adet ${cell.productTypeCode} (${cell.technicalValues})`;
    });
  }
  
  const customerInfo = `\n\nMüşteri: ${orderData.customerInfo.name}`;
  
  const responseText = `${summary}${productionSummary}${materialSummary}${cellInfo}${customerInfo}`;
  
  const suggestions = [
    `${orderData.orderNo} için detaylı rapor`,
    `${orderData.orderNo} için malzeme listesi`,
    `${orderData.orderNo} için üretim planı`,
    'Benzer siparişleri göster'
  ];
  
  if (orderData.status === 'delayed') {
    suggestions.push('Gecikmeyi çözmek için öneriler');
  }
  
  return {
    text: responseText,
    timestamp: new Date(),
    suggestions,
    additionalData: {
      type: 'orderDetails',
      order: orderData,
      materials: materialsStatus,
      productionPlan: productionPlan
    }
  };
};

/**
 * Malzemeler için yanıt oluşturur
 * @param {Array} materials - Malzeme listesi
 * @param {string} type - Yanıt tipi ('critical', 'normal')
 * @returns {object} Oluşturulan yanıt
 */
const createMaterialsResponse = (materials, type) => {
  let responseText = '';
  let suggestions = [];
  
  if (type === 'critical') {
    responseText = `Kritik stok seviyesindeki ${materials.length} malzeme bulundu:`;
    materials.forEach(mat => {
      responseText += `\n- ${mat.name} (${mat.code}): Stok ${mat.currentStock}/${mat.minLevel}`;
      
      if (mat.expectedDelivery) {
        responseText += `, Beklenen teslimat: ${mat.expectedDelivery}`;
      }
      
      if (mat.neededFor && mat.neededFor.length > 0) {
        const orderCount = mat.neededFor.length;
        responseText += `, ${orderCount} siparişte kullanılacak`;
      }
    });
    
    suggestions = [
      'Tüm stok durumunu göster',
      'Acil sipariş verilmesi gereken malzemeler',
      'Stok optimizasyon önerileri',
      'En çok kullanılan malzemeler'
    ];
  }
  
  return {
    text: responseText,
    timestamp: new Date(),
    suggestions,
    additionalData: {
      type: type === 'critical' ? 'criticalMaterials' : 'materials',
      materials
    }
  };
};

/**
 * Üretim planı yanıtı oluşturur
 * @param {object} plan - Üretim planı
 * @param {string} timeframe - Zaman dilimi ('daily', 'weekly', 'monthly')
 * @returns {object} Oluşturulan yanıt
 */
const createProductionPlanResponse = (plan, timeframe) => {
  let responseText = '';
  let suggestions = [];
  
  if (!plan) {
    return {
      text: 'Üretim planı bilgileri şu an için mevcut değil.',
      timestamp: new Date(),
      suggestions: [
        'Üretim durumunu güncelle',
        'Üretim sorunlarını göster'
      ]
    };
  }
  
  if (timeframe === 'daily') {
    responseText = `${plan.date} tarihli günlük üretim planı:\n`;
    responseText += `Planlanan: ${plan.plannedItems} adet, Tamamlanan: ${plan.completedItems} adet, Geciken: ${plan.delayedItems} adet\n\n`;
    
    responseText += 'Birim bazında durum:\n';
    plan.sections.forEach(section => {
      responseText += `- ${section.name}: ${section.completed}/${section.planned} tamamlandı (Verimlilik: %${section.efficiency})\n`;
    });
    
    if (plan.orders && plan.orders.length > 0) {
      responseText += '\nBugün işlenen siparişler:\n';
      plan.orders.forEach(order => {
        responseText += `- ${order.orderNo}: ${order.today} aşamasında (${order.status === 'in_progress' ? 'Devam Ediyor' : 'Planlandı'})\n`;
      });
    }
    
    suggestions = [
      'Bu haftaki üretim planını göster',
      'Yarınki üretim planını göster',
      'Geciken işleri listele',
      'Üretim verimliliği raporu oluştur'
    ];
  } else if (timeframe === 'weekly') {
    responseText = `${plan.startDate} - ${plan.endDate} arası haftalık üretim planı:\n`;
    responseText += `Planlanan: ${plan.plannedItems} adet, Tamamlanan: ${plan.completedItems} adet, Geciken: ${plan.delayedItems} adet\n\n`;
    
    responseText += 'Departman bazında durum:\n';
    plan.departments.forEach(dept => {
      responseText += `- ${dept.name}: ${dept.completed}/${dept.planned} tamamlandı (Verimlilik: %${dept.efficiency})\n`;
    });
    
    if (plan.topOrders && plan.topOrders.length > 0) {
      responseText += '\nÖncelikli siparişler:\n';
      plan.topOrders.forEach(order => {
        responseText += `- ${order.orderNo}: %${order.progress} tamamlandı (Öncelik: ${order.priority === 'high' ? 'Yüksek' : 'Orta'})\n`;
      });
    }
    
    suggestions = [
      'Günlük üretim detayını göster',
      'Aylık üretim planını göster',
      'Kritik siparişleri listele',
      'Haftalık verimlilik analizi'
    ];
  } else {
    responseText = `${plan.month} ayı üretim planı:\n`;
    responseText += `Planlanan: ${plan.plannedItems} adet, Tamamlanan: ${plan.completedItems} adet, Geciken: ${plan.delayedItems} adet\n`;
    responseText += `Genel verimlilik oranı: %${plan.efficiencyRate}\n\n`;
    
    responseText += 'Ürün tipi bazında üretim:\n';
    plan.productionByType.forEach(prod => {
      responseText += `- ${prod.type}: ${prod.completed}/${prod.planned} tamamlandı\n`;
    });
    
    suggestions = [
      'Bu haftaki plana odaklan',
      'Gelecek ay planını göster',
      'Kapasite analizi raporu oluştur',
      'Verimlilik optimizasyon önerileri'
    ];
  }
  
  return {
    text: responseText,
    timestamp: new Date(),
    suggestions,
    additionalData: {
      type: `${timeframe}Production`,
      plan
    }
  };
};

/**
 * Stok özeti yanıtı oluşturur
 * @param {object} summary - Stok özeti
 * @returns {object} Oluşturulan yanıt
 */
const createStockSummaryResponse = (summary) => {
  if (!summary) {
    return {
      text: 'Stok bilgileri şu an için mevcut değil.',
      timestamp: new Date(),
      suggestions: [
        'Stok durumunu güncelle',
        'Kritik malzemeleri göster'
      ]
    };
  }
  
  let responseText = 'Genel stok durumu özeti:\n';
  responseText += `Toplam ${summary.totalMaterials} adet malzeme stokta bulunuyor.\n`;
  responseText += `Kritik seviyede olan: ${summary.criticalCount} adet\n`;
  responseText += `Siparişlere ayrılmış: ${summary.reservedCount} adet\n`;
  responseText += `Toplam stok değeri: ₺${summary.stockValue.toLocaleString()}\n\n`;
  
  if (summary.recentlyChanged && summary.recentlyChanged.length > 0) {
    responseText += 'Son stok hareketleri:\n';
    summary.recentlyChanged.forEach(item => {
      const changeText = item.change > 0 ? `+${item.change} eklendi` : `${item.change} çıkış yapıldı`;
      const date = item.date.toLocaleDateString('tr-TR');
      responseText += `- ${item.name} (${item.code}): ${changeText} (${date})\n`;
    });
  }
  
  const suggestions = [
    'Kritik stok seviyesindeki malzemeleri göster',
    'Stok optimizasyon önerileri',
    'En çok kullanılan malzemeler',
    'Stok raporu oluştur'
  ];
  
  return {
    text: responseText,
    timestamp: new Date(),
    suggestions,
    additionalData: {
      type: 'stockSummary',
      summary
    }
  };
};

// Export edilecek API
export {
  isConnected,
  isProcessing,
  currentMode,
  currentLanguage,
  supportedLanguages,
  hasNewSuggestion,
  learningMode,
  chatHistory,
  assistantInfo,
  aiModes,
  initialize,
  initializeAI,
  sendMessage,
  setMode,
  setLanguage,
  clearChatHistory,
  setLearningMode,
  generateReport,
  trainAI,
  getLearningMode,
  getCurrentMode,
  getModes,
  getChatHistory,
  clearSuggestions
};