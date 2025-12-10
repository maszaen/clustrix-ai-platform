import { View, StyleSheet } from 'react-native';
import { WebView } from 'react-native-webview';
import { COLORS } from '../constants/colors';
import { DIAMOND_LOGO_HTML } from '../constants/strings';

/**
 * App Loading Screen with animated diamond logo
 * Shown while fonts and database are loading
 */
export default function LoadingScreen() {
  const html = DIAMOND_LOGO_HTML(COLORS.accent);
  
  return (
    <View style={styles.container}>
      <WebView
        source={{ html }}
        style={styles.webview}
        scrollEnabled={false}
        overScrollMode="never"
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
        scalesPageToFit={false}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        originWhitelist={['*']}
        androidLayerType="hardware"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  webview: {
    width: 150,
    height: 150,
    backgroundColor: 'transparent',
  },
});
