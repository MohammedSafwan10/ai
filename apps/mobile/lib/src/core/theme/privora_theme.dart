import 'package:flutter/material.dart';

@immutable
class PrivoraColors extends ThemeExtension<PrivoraColors> {
  const PrivoraColors({
    required this.background,
    required this.surface,
    required this.userBubble,
    required this.border,
    required this.text,
    required this.muted,
    required this.accent,
    required this.accentHover,
    required this.accentForeground,
    required this.shadow,
  });

  final Color background;
  final Color surface;
  final Color userBubble;
  final Color border;
  final Color text;
  final Color muted;
  final Color accent;
  final Color accentHover;
  final Color accentForeground;
  final Color shadow;

  static const light = PrivoraColors(
    background: Color(0xFFF4F0EA),
    surface: Color(0xFFFFFFFF),
    userBubble: Color(0xFFEBE5D9),
    border: Color(0xFFE2DCD0),
    text: Color(0xFF292524),
    muted: Color(0xFF665F59),
    accent: Color(0xFF171717),
    accentHover: Color(0xFF262626),
    accentForeground: Color(0xFFFFFFFF),
    shadow: Color(0x40A89F91),
  );

  static const dark = PrivoraColors(
    background: Color(0xFF212121),
    surface: Color(0xFF2F2F2F),
    userBubble: Color(0xFF3A3A3A),
    border: Color(0xFF424242),
    text: Color(0xFFECECEC),
    muted: Color(0xFFA1A1A1),
    accent: Color(0xFFECECEC),
    accentHover: Color(0xFFFFFFFF),
    accentForeground: Color(0xFF171717),
    shadow: Color(0x4D000000),
  );

  @override
  ThemeExtension<PrivoraColors> copyWith({
    Color? background,
    Color? surface,
    Color? userBubble,
    Color? border,
    Color? text,
    Color? muted,
    Color? accent,
    Color? accentHover,
    Color? accentForeground,
    Color? shadow,
  }) => PrivoraColors(
    background: background ?? this.background,
    surface: surface ?? this.surface,
    userBubble: userBubble ?? this.userBubble,
    border: border ?? this.border,
    text: text ?? this.text,
    muted: muted ?? this.muted,
    accent: accent ?? this.accent,
    accentHover: accentHover ?? this.accentHover,
    accentForeground: accentForeground ?? this.accentForeground,
    shadow: shadow ?? this.shadow,
  );

  @override
  ThemeExtension<PrivoraColors> lerp(covariant PrivoraColors? other, double t) {
    if (other == null) return this;
    return PrivoraColors(
      background: Color.lerp(background, other.background, t)!,
      surface: Color.lerp(surface, other.surface, t)!,
      userBubble: Color.lerp(userBubble, other.userBubble, t)!,
      border: Color.lerp(border, other.border, t)!,
      text: Color.lerp(text, other.text, t)!,
      muted: Color.lerp(muted, other.muted, t)!,
      accent: Color.lerp(accent, other.accent, t)!,
      accentHover: Color.lerp(accentHover, other.accentHover, t)!,
      accentForeground: Color.lerp(
        accentForeground,
        other.accentForeground,
        t,
      )!,
      shadow: Color.lerp(shadow, other.shadow, t)!,
    );
  }
}

extension PrivoraThemeContext on BuildContext {
  PrivoraColors get colors => Theme.of(this).extension<PrivoraColors>()!;
}

class PrivoraTheme {
  static ThemeData light(TextTheme sans, TextTheme display) =>
      _theme(PrivoraColors.light, sans, display, Brightness.light);
  static ThemeData dark(TextTheme sans, TextTheme display) =>
      _theme(PrivoraColors.dark, sans, display, Brightness.dark);

  static ThemeData _theme(
    PrivoraColors colors,
    TextTheme sans,
    TextTheme display,
    Brightness brightness,
  ) {
    final base = ThemeData(
      useMaterial3: true,
      brightness: brightness,
      scaffoldBackgroundColor: colors.background,
      colorScheme: ColorScheme.fromSeed(
        seedColor: colors.accent,
        brightness: brightness,
      ),
      textTheme: sans.apply(bodyColor: colors.text, displayColor: colors.text),
      extensions: [colors],
    );
    return base.copyWith(
      appBarTheme: AppBarTheme(
        backgroundColor: colors.background,
        foregroundColor: colors.text,
        elevation: 0,
      ),
      dividerColor: colors.border,
      iconTheme: IconThemeData(color: colors.muted, size: 20),
      bottomSheetTheme: BottomSheetThemeData(
        backgroundColor: colors.surface,
        modalBackgroundColor: colors.surface,
        surfaceTintColor: Colors.transparent,
        modalBarrierColor: Colors.black.withValues(alpha: 0.28),
        shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(28)),
        ),
      ),
      popupMenuTheme: PopupMenuThemeData(
        color: colors.surface,
        surfaceTintColor: Colors.transparent,
        iconColor: colors.muted,
        textStyle: TextStyle(color: colors.text, fontWeight: FontWeight.w500),
        shape: RoundedRectangleBorder(
          side: BorderSide(color: colors.border),
          borderRadius: BorderRadius.circular(14),
        ),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: colors.background.withValues(alpha: 0.58),
        labelStyle: TextStyle(color: colors.muted),
        hintStyle: TextStyle(color: colors.muted.withValues(alpha: 0.72)),
        enabledBorder: OutlineInputBorder(
          borderSide: BorderSide(color: colors.border),
          borderRadius: BorderRadius.circular(14),
        ),
        focusedBorder: OutlineInputBorder(
          borderSide: BorderSide(color: colors.accent, width: 1.2),
          borderRadius: BorderRadius.circular(14),
        ),
        border: OutlineInputBorder(
          borderSide: BorderSide(color: colors.border),
          borderRadius: BorderRadius.circular(14),
        ),
      ),
      listTileTheme: ListTileThemeData(
        iconColor: colors.muted,
        textColor: colors.text,
        subtitleTextStyle: TextStyle(color: colors.muted, fontSize: 12),
      ),
      chipTheme: base.chipTheme.copyWith(
        backgroundColor: colors.background.withValues(alpha: 0.55),
        selectedColor: colors.userBubble,
        checkmarkColor: colors.text,
        labelStyle: TextStyle(color: colors.text, fontWeight: FontWeight.w600),
        secondaryLabelStyle: TextStyle(color: colors.text),
        side: BorderSide(color: colors.border),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      ),
      segmentedButtonTheme: SegmentedButtonThemeData(
        style: ButtonStyle(
          backgroundColor: WidgetStateProperty.resolveWith(
            (states) => states.contains(WidgetState.selected)
                ? colors.userBubble
                : colors.background.withValues(alpha: 0.4),
          ),
          foregroundColor: WidgetStatePropertyAll(colors.text),
          side: WidgetStatePropertyAll(BorderSide(color: colors.border)),
          shape: WidgetStatePropertyAll(
            RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
          ),
        ),
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          backgroundColor: colors.accent,
          foregroundColor: colors.accentForeground,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(14),
          ),
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          foregroundColor: colors.text,
          side: BorderSide(color: colors.border),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(14),
          ),
        ),
      ),
      textButtonTheme: TextButtonThemeData(
        style: TextButton.styleFrom(foregroundColor: colors.text),
      ),
      textTheme: base.textTheme.copyWith(
        headlineMedium: display.headlineMedium?.copyWith(
          color: colors.text,
          fontWeight: FontWeight.w500,
        ),
        titleLarge: display.titleLarge?.copyWith(
          color: colors.text,
          fontWeight: FontWeight.w600,
        ),
      ),
    );
  }
}
