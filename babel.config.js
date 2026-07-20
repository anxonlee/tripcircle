module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    // react-native-worklets/reanimated require this plugin, and it must be last.
    plugins: ['react-native-worklets/plugin'],
  };
};
