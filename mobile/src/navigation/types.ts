export type RootStackParamList = {
  Tabs: undefined;
  Profile: undefined;
};

// Registers RootStackParamList as react-navigation's default param list, so
// useNavigation()/navigate() calls anywhere in the app (e.g. TopBar) are
// typed without needing an explicit generic or an `as never` cast at every
// call site. See https://reactnavigation.org/docs/typescript/
declare global {
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
}
