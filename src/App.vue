<template>
  <div id="app">
    <router-view />
    <!-- AI Chatbot Bileşenleri -->
    <AIChatbotButton />
    <AIChatModal v-if="isAIChatModalOpen" @close="closeAIChatModal" :isVisible="isAIChatModalOpen" />
  </div>
</template>

<script>
import { ref, computed, onMounted } from 'vue';
import AIChatbotButton from '@/components/ai/AIChatbotButton.vue';
import AIChatModal from '@/components/ai/AIChatModal.vue';
import { useTechnicalStore } from '@/store/technical';

export default {
  name: 'App',
  components: {
    AIChatbotButton,
    AIChatModal
  },
  setup() {
    const technicalStore = useTechnicalStore();
    
    // AI Chat Modal durumu
    const isAIChatModalOpen = computed(() => technicalStore.isAIChatModalOpen);
    
    // Modal'ı kapat
    const closeAIChatModal = () => {
      technicalStore.setAIChatModalOpen(false);
    };
    
    return {
      isAIChatModalOpen,
      closeAIChatModal
    };
  }
};
</script>

<style lang="scss">
@forward '@/styles/main.scss';

#app {
  font-family: 'Avenir', Helvetica, Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  color: #2c3e50;
  min-height: 100vh;
}
</style>