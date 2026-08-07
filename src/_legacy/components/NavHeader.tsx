import { MaterialCommunityIcons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme/colors';

/**
 * Back header for pushed stack screens (ui-guide §4): 44px row, chevron-left,
 * centered sentence-case title, optional right accessory. No clay — the
 * screen's single clay action lives in its body/footer.
 */
export function NavHeader({
  title,
  onBack,
  right,
}: {
  title: string;
  onBack: () => void;
  right?: React.ReactNode;
}) {
  return (
    <View style={styles.row}>
      <Pressable onPress={onBack} hitSlop={10} style={styles.back}>
        <MaterialCommunityIcons name="chevron-left" size={26} color={colors.textPrimary} />
      </Pressable>
      <Text style={styles.title} numberOfLines={1}>
        {title}
      </Text>
      <View style={styles.right}>{right}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    height: 44,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  back: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
  title: {
    flex: 1,
    textAlign: 'center',
    fontSize: 15,
    fontWeight: '500',
    color: colors.textPrimary,
  },
  right: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
});
