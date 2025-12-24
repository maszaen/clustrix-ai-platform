import { useState } from 'react';
import { View, Text, TextInput, StyleSheet, ScrollView, Pressable, Linking } from 'react-native';
import { useApp } from '../context/AppContext';
import { COLORS } from '../constants/colors';
import { FONTS } from '../constants/fonts';
import SlideLeftModal from '../components/SlideLeftModal';
import AlertModal from '../components/AlertModal';
import DropdownSelect from '../components/DropdownSelect';
import AccountScreen from './AccountScreen';
import AgenticToolsScreen from './AgenticToolsScreen';
import ImageModelsScreen from './ImageModelsScreen';
import { LinearGradient } from 'expo-linear-gradient';

const LANGUAGES = [
  { id: 'autodetect', name: 'Auto-detect' },
  { id: 'english', name: 'English' },
  { id: 'indonesia', name: 'Indonesian' },
];

// Bullet List Component for proper ul/li styling
function BulletList({ items }) {
  return (
    <View style={styles.bulletList}>
      {items.map((item, index) => (
        <View key={index} style={styles.bulletItem}>
          <View style={styles.bullet} />
          <Text style={styles.bulletText}>{item}</Text>
        </View>
      ))}
    </View>
  );
}

// Custom Instructions Content (rendered inside SlideLeftModal)
function CustomInstructionsContent({ settings, onUpdate, onClose, onShowSaved }) {
  const [persona, setPersona] = useState(settings.persona || { name: '', work: '', prefs: '' });
  const [language, setLanguage] = useState(settings.language || 'autodetect');

  const handleSave = () => {
    onUpdate({ persona, language });
    onShowSaved();
    onClose();
  };

  return (
    <ScrollView showsVerticalScrollIndicator={false} style={styles.subContainer} contentContainerStyle={styles.content}>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Your Name</Text>
        <TextInput
          style={styles.input}
          value={persona.name}
          onChangeText={(text) => setPersona({ ...persona, name: text })}
          placeholder="What should I call you?"
          placeholderTextColor={COLORS.fgMuted}
        />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Your Work</Text>
        <TextInput
          style={styles.input}
          value={persona.work}
          onChangeText={(text) => setPersona({ ...persona, work: text })}
          placeholder="What do you do? (e.g., Software Engineer)"
          placeholderTextColor={COLORS.fgMuted}
        />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Preferences</Text>
        <TextInput
          style={[styles.input, styles.inputMultiline]}
          value={persona.prefs}
          onChangeText={(text) => setPersona({ ...persona, prefs: text })}
          placeholder="How should I respond? (e.g., Be concise, use examples)"
          placeholderTextColor={COLORS.fgMuted}
          multiline
          numberOfLines={4}
        />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Response Language</Text>
        <DropdownSelect
          label="Select Language"
          value={language}
          options={LANGUAGES}
          onSelect={(item) => setLanguage(item.id)}
        />
      </View>

      <Pressable style={styles.saveBtn} onPress={handleSave} android_ripple={{ color: 'rgba(255,255,255,0.2)' }}>
        <Text style={styles.saveBtnText}>Save Instructions</Text>
      </Pressable>
    </ScrollView>
  );
}

// Settings Menu Content
function SettingsMenuContent({ onOpenCustomInstructions, onOpenAccount, onOpenAgenticTools, onOpenImageModels, onOpenPrivacyPolicy, onOpenLicense, onOpenAbout }) {
  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.menuContent}>
      <SlideLeftModal.Category
        title="Preferences"
        items={[
          { icon: 'receipt-outline', title: 'Custom Instructions', description: 'Persona and preferences', onPress: onOpenCustomInstructions },
          { icon: 'search-outline', title: 'Web Search', description: 'Configure search API for Agentic Mode', onPress: onOpenAgenticTools },
          { icon: 'images-outline', title: 'Image Model', description: 'Configure image model for image gen', onPress: onOpenImageModels },
          { icon: 'person-outline', title: 'Account', description: 'Backup/restore chats', onPress: onOpenAccount },
        ]}
      />

      <SlideLeftModal.Category
        title="Support"
        items={[
          {
            icon: 'bug-outline',
            title: 'Report a Bug',
            description: 'Report app issues',
            onPress: () => Linking.openURL('https://github.com/maszaen/clustrix-ai-platform/issues'),
          },
          {
            icon: 'git-branch-outline',
            title: 'Contribution',
            description: 'Contribute to Clustrix',
            onPress: () => Linking.openURL('https://github.com/maszaen/clustrix-ai-platform'),
          },
        ]}
      />

      <SlideLeftModal.Category
        title="About"
        items={[
          { icon: 'shield-outline', title: 'Privacy Policy', description: 'How we handle your data', onPress: onOpenPrivacyPolicy },
          { icon: 'document-text-outline', title: 'License', description: 'Open source licenses', onPress: onOpenLicense },
          { icon: 'information-circle-outline', title: 'About App', description: 'Learn more about Clustrix', onPress: onOpenAbout },
        ]}
      />
    </ScrollView>
  );
}

// Privacy Policy Content
function PrivacyPolicyContent() {
  return (
    <ScrollView showsVerticalScrollIndicator={false} style={styles.subContainer} contentContainerStyle={styles.content}>
      <View style={styles.section}>
        <Text style={styles.infoTitle}>Customer Agreement</Text>
        <Text style={styles.infoText}>Last updated: 13 December 2025 at 10.03</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitleNoPadding}>Data Collection</Text>
        <Text style={styles.infoText}>
          Clustrix is designed with privacy in mind. Your conversations and personal data are stored locally on your device only. We do not collect, store, or transmit your chat data to our servers.
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitleNoPadding}>API Keys</Text>
        <Text style={styles.infoText}>
          Your API keys are stored securely on your device and are never transmitted to any server other than the AI provider you choose to use (OpenAI, Anthropic, Google, etc.).
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitleNoPadding}>Cloud Backup</Text>
        <Text style={styles.infoText}>
          If you choose to use our optional cloud backup feature, your data is encrypted before being uploaded. Only you can decrypt your data using your account.
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitleNoPadding}>Third-Party Services</Text>
        <Text style={styles.infoText}>When you use AI providers (OpenAI, Anthropic, Google, etc.), your messages are sent directly to their servers according to their own privacy policies.</Text>
      </View>
      
      <View style={styles.section}>
        <Text style={styles.sectionTitleNoPadding}>Contact</Text>
        <Text style={styles.infoText}>
          For privacy-related questions, please contact Zaeni Ahmad at zaeniahmad@proton.me
        </Text>
      </View>

      
    </ScrollView>
  );
}

// License Content
function LicenseContent() {
  return (
    <ScrollView showsVerticalScrollIndicator={false} style={styles.subContainer} contentContainerStyle={styles.content}>
      <View style={styles.section}>
        <Text style={styles.infoTitle}>Open Source Licenses</Text>
        <Text style={styles.infoText}>Clustrix is built with love using open source software.</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitleNoPadding}>MIT License</Text>
        <Text style={styles.infoText}>
          Copyright (c) 2024 Zaeni Ahmad{'\n\n'}
          Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software.{'\n\n'}
          THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED.
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitleNoPadding}>Dependencies</Text>
        <BulletList items={[
          'React Native - MIT License',
          'Expo - MIT License',
          'LegendList - MIT License',
          'Lucide Icons - ISC License',
          'React Native Markdown Display - MIT License',
          'React Native Gesture Handler - MIT License',
          'React Native Reanimated - MIT License',
        ]} />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitleNoPadding}>Acknowledgments</Text>
        <Text style={styles.infoText}>
          Special thanks to all the open source contributors who make projects like this possible. Built by Zaeni Ahmad with ❤️
        </Text>
      </View>
    </ScrollView>
  );
}

// About Clustrix Content
function AboutClustrixContent() {
  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      style={styles.subContainer}
      contentContainerStyle={styles.content}
    >

      <View style={styles.section}>
        <Text style={styles.infoTitle}>What is Clustrix?</Text>

        <Text style={styles.infoText}>
          Clustrix is a native mobile AI chat client built to help you work with multiple AI providers from one clean,
          fast interface. It’s designed for everyday use like quick questions, deeper research, drafting, and iterative work
          while keeping your configuration and chat history in your control.
          {'\n\n'}
          You can connect providers such as OpenAI, Anthropic, and Google, then choose models based on your needs
          (speed, cost, reasoning depth, or capabilities). Clustrix focuses on the details that matter on mobile:
          responsive UI, streaming output, and a layout that stays readable in long conversations.
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitleNoPadding}>How it works</Text>
        <BulletList
          items={[
            'Bring your own API keys for each provider.',
            'Your messages are sent directly to the provider you select, following that provider’s policies.',
            'Chats are stored locally by default, with optional encrypted backup if you enable it.',
          ]}
        />

        <Text style={styles.infoText}>
          If you’re using Clustrix for work or sensitive information, review the Privacy Policy section in Settings for
          details on data handling and third-party services.
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitleNoPadding}>Features</Text>

        {/* Keep the original feature list intact (no items removed) */}
        <BulletList
          items={[
            'Multi-provider support (OpenAI, Anthropic, Google, and more)',
            'Native thinking/reasoning display for supported models',
            'Real-time streaming responses',
            'Beautiful dark mode interface',
            'Local-first data storage',
            'Optional cloud backup',
            'Custom instructions and persona settings',
          ]}
        />

        <Text style={styles.infoText}>
          These features are designed to work together: switch providers without changing your workflow, see results as
          they stream, and use custom instructions to keep outputs consistent across chats and models.
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitleNoPadding}>Privacy-first by design</Text>
        <Text style={styles.infoText}>
          Clustrix aims to minimize data exposure and keep choices explicit. Local-first storage reduces dependency on
          external services, while optional backup is there for users who want cross-device continuity. When you use a
          third-party AI provider, requests are handled by that provider—so it’s important to understand their privacy
          terms before sending sensitive content.
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitleNoPadding}>Open source</Text>
        <Text style={styles.infoText}>
          Clustrix is built with open source software and is available on GitHub. You can report bugs, request features,
          or contribute improvements through issues and pull requests.
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitleNoPadding}>Support & links</Text>
        <BulletList
          items={[
            'Email: zaeniahmad@proton.me',
            'GitHub: github.com/maszaen',
          ]}
        />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitleNoPadding}>Maintainer</Text>
        <Text style={styles.infoText}>
          Created and maintained by Zaeni Ahmad.
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.infoText}>
          Thank you for using Clustrix. If you find it useful, please consider leaving a review or contributing to the
          project.
        </Text>
      </View>
    </ScrollView>
  );
}


export default function PersonalizationScreen({ visible, onClose }) {
  const { settings, updateSettings } = useApp();
  const [showCustomInstructions, setShowCustomInstructions] = useState(false);
  const [showAccount, setShowAccount] = useState(false);
  const [showAgenticTools, setShowAgenticTools] = useState(false);
  const [showImageModels, setShowImageModels] = useState(false);
  const [showSavedAlert, setShowSavedAlert] = useState(false);
  const [showPrivacyPolicy, setShowPrivacyPolicy] = useState(false);
  const [showLicense, setShowLicense] = useState(false);
  const [showAbout, setShowAbout] = useState(false);

  return (
    <>
      {/* Main Settings Modal */}
      <SlideLeftModal visible={visible} onClose={onClose} title="Settings">
        <SettingsMenuContent 
          onOpenCustomInstructions={() => setShowCustomInstructions(true)} 
          onOpenAgenticTools={() => setShowAgenticTools(true)}
          onOpenImageModels={() => setShowImageModels(true)}
          onOpenAccount={() => setShowAccount(true)}
          onOpenPrivacyPolicy={() => setShowPrivacyPolicy(true)}
          onOpenLicense={() => setShowLicense(true)}
          onOpenAbout={() => setShowAbout(true)}
        />
      </SlideLeftModal>

      {/* Custom Instructions Submenu */}
      <SlideLeftModal 
        visible={showCustomInstructions} 
        onClose={() => setShowCustomInstructions(false)} 
        title="Custom Instructions"
      >
        <CustomInstructionsContent 
          settings={settings} 
          onUpdate={updateSettings} 
          onClose={() => setShowCustomInstructions(false)}
          onShowSaved={() => setShowSavedAlert(true)}
        />
      </SlideLeftModal>

      {/* Web Search Config Screen */}
      <SlideLeftModal 
        visible={showAgenticTools} 
        onClose={() => setShowAgenticTools(false)} 
        title="Web Search"
        showGradients={false}
      >
        <AgenticToolsScreen onClose={() => setShowAgenticTools(false)} />
      </SlideLeftModal>

      {/* Image Models Screen */}
      <SlideLeftModal 
        visible={showImageModels} 
        onClose={() => setShowImageModels(false)} 
        title="Image Model"
        showGradients={false}
      >
        <ImageModelsScreen onClose={() => setShowImageModels(false)} />
      </SlideLeftModal>

      {/* Account Screen */}
      <AccountScreen visible={showAccount} onClose={() => setShowAccount(false)} />

      {/* Privacy Policy */}
      <SlideLeftModal 
        visible={showPrivacyPolicy} 
        onClose={() => setShowPrivacyPolicy(false)} 
        title="Privacy Policy"
      >
        <PrivacyPolicyContent />
      </SlideLeftModal>

      {/* License */}
      <SlideLeftModal 
        visible={showLicense} 
        onClose={() => setShowLicense(false)} 
        title="License"
      >
        <LicenseContent />
      </SlideLeftModal>

      {/* About Clustrix */}
      <SlideLeftModal 
        visible={showAbout} 
        onClose={() => setShowAbout(false)} 
        title="About Clustrix"
      >
       
        <AboutClustrixContent />
      </SlideLeftModal>
      
      {/* Saved Alert */}
      <AlertModal
        visible={showSavedAlert}
        title="Saved"
        message="Custom instructions saved"
        primaryText="Okay"
        onPrimary={() => setShowSavedAlert(false)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  menuContent: { paddingBottom: 40 },
  subContainer: { flex: 1, paddingTop: 10},
  content: { paddingBottom: 40 },
  section: { marginBottom: 20 },
  sectionTitle: { color: COLORS.fgMuted, fontSize: 12, fontFamily: FONTS.ai, textTransform: 'uppercase', letterSpacing: 0.5, paddingHorizontal: 4, marginBottom: 6 },
  sectionTitleNoPadding: { color: COLORS.fg, fontSize: 12, fontFamily: FONTS.ai, textTransform: 'uppercase', letterSpacing: 0.5, paddingHorizontal: 0, marginBottom: 6 },
  input: {
    backgroundColor: COLORS.inputBg,
    borderRadius: 15,
    padding: 14,
    color: COLORS.fg,
    fontSize: 14,
    fontFamily: FONTS.sans,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
  },
  floatingHeader: {
    position: 'absolute',
    top: 500,
    left: 0,
    right: 0,
    zIndex: 5,
  },
  inputMultiline: { minHeight: 100, textAlignVertical: 'top' },
  saveBtn: {
    backgroundColor: COLORS.accent,
    padding: 14,
    borderRadius: 15,
    alignItems: 'center',
    marginTop: 8,
  },
  saveBtnText: { color: COLORS.fg, fontSize: 15, fontFamily: FONTS.display },
  infoTitle: { 
    color: COLORS.fg, 
    fontSize: 22, 
    fontFamily: FONTS.display, 
    marginBottom: 4,
  },
  infoText: { 
    color: COLORS.fgMuted, 
    fontSize: 14, 
    fontFamily: FONTS.sans, 
    lineHeight: 22,
  },
  bulletList: {
    marginTop: 4,
  },
  bulletItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 8,
    paddingLeft: 7,
  },
  bullet: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: COLORS.fgMuted,
    marginTop: 8,
    marginRight: 12,
  },
  bulletText: {
    flex: 1,
    color: COLORS.fgMuted,
    fontSize: 14,
    fontFamily: FONTS.sans,
    lineHeight: 22,
  },
});
