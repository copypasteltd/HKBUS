export default defineAppConfig({
  pages:['pages/home/index','pages/routes/index','pages/search/index','pages/nearby/index','pages/arrivals/index','pages/route/index','pages/bookmarks/index','pages/settings/index','pages/notices/index','pages/notice/index','pages/help/index','pages/reminders/index','pages/planner/index','pages/traffic/index','pages/trips/index','pages/watchboard/index','pages/road/index','pages/map/index','pages/journey/index'],
  window:{navigationStyle:'custom',navigationBarTitleText:'港巴通',navigationBarBackgroundColor:'#f8faf9',navigationBarTextStyle:'black',backgroundColor:'#f8faf9',backgroundTextStyle:'dark'},
  ...(process.env.TARO_ENV==='weapp'?{darkmode:true,permission:{'scope.userLocation':{desc:'用於尋找附近巴士站；拒絕授權仍可手動搜尋'}},requiredPrivateInfos:['getLocation']}:{})
});
