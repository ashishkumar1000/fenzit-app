# Add project specific ProGuard rules here.
# By default, the flags in this file are appended to flags specified
# in /usr/local/Cellar/android-sdk/24.3.3/tools/proguard/proguard-android.txt
# You can edit the include path and order by changing the proguardFiles
# directive in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# Add any project specific keep options here:

# Room creates database classes (incl. WorkManager's WorkDatabase_Impl) by
# reflection and needs their no-arg constructor. Room's consumer rule keeps the
# class but not the constructor, so R8 removed it and release crashed at startup
# (InitializationProvider). Keep only RoomDatabase subclass constructors.
-keep class * extends androidx.room.RoomDatabase {
    <init>();
}

# react-native-nitro-geolocation (and Nitro Modules) reach their Android context
# through reflection / JNI. Release builds showed getCurrentPosition failing with
# "Context.checkPermission on a null object reference" while the non-minified
# debug build worked. R8 shrinking is the likely cause (not yet confirmed on a
# device), so keep the Nitro packages whole.
-keep class com.margelo.nitro.** { *; }
-keep class com.margelo.nitro.nitrogeolocation.** { *; }
