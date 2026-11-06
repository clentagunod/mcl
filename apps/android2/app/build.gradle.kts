plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.google.services) apply false
    id("com.google.devtools.ksp")
    id("com.google.dagger.hilt.android")
    id("org.jetbrains.kotlin.plugin.serialization")
    id("androidx.baselineprofile")
}

if (file("google-services.json").exists()) apply(plugin = "com.google.gms.google-services")

android {
    namespace = "com.mcl.mcllendingapp"
    compileSdk { version = release(37) }
    defaultConfig {
        applicationId = "com.mcl.mcllendingapp"
        minSdk = 24
        targetSdk = 37
        versionCode = 2
        versionName = "2.0"
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }
    buildTypes {
        release { optimization { enable = true } }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
        isCoreLibraryDesugaringEnabled = true
    }
    buildFeatures { compose = true }
}

ksp { arg("room.schemaLocation", "$projectDir/schemas") }
baselineProfile { automaticGenerationDuringBuild = false }

tasks.withType<org.gradle.api.tasks.testing.Test>().configureEach {
    testLogging {
        events("failed", "skipped")
        exceptionFormat = org.gradle.api.tasks.testing.logging.TestExceptionFormat.FULL
    }
}

val documentAssets = layout.buildDirectory.dir("generated/documents/assets")
val prepareDocuments = tasks.register<Copy>("prepareDocuments") {
    from(rootProject.file("../web/src/templates")) { include("promissory.html", "promissory.docx") }
    from(rootProject.file("../web/src/print.css"))
    from(rootProject.file("../web/public/assets/logo.png"))
    into(documentAssets.map { it.dir("documents") })
}
android.sourceSets.getByName("main").assets.srcDir(documentAssets.get().asFile)
val launcherLogoDirectory = layout.buildDirectory.dir("generated/launcherLogo/res")
val prepareLauncherLogo = tasks.register<Copy>("prepareLauncherLogo") {
    from(rootProject.file("../web/public/assets/logo.png"))
    into(launcherLogoDirectory.map { it.dir("drawable-nodpi") })
    rename { "mcl_logo.png" }
}
android.sourceSets.getByName("main").res.srcDir(launcherLogoDirectory.get().asFile)
tasks.named("preBuild") { dependsOn(prepareDocuments, prepareLauncherLogo) }

dependencies {
    implementation(platform(libs.androidx.compose.bom))
    implementation(platform(libs.firebase.bom))
    implementation(libs.firebase.auth)
    implementation(libs.firebase.firestore)
    implementation(libs.kotlinx.coroutines.play.services)
    implementation("androidx.core:core-ktx:1.17.0")
    implementation("androidx.activity:activity-compose:1.11.0")
    implementation("androidx.lifecycle:lifecycle-runtime-compose:2.9.4")
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.9.4")
    implementation("androidx.lifecycle:lifecycle-process:2.9.4")
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.ui:ui-graphics")
    implementation("androidx.compose.ui:ui-tooling-preview")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.material3:material3-window-size-class")
    implementation("androidx.compose.material:material-icons-extended")
    implementation("androidx.navigation:navigation-compose:2.9.8")
    implementation("androidx.hilt:hilt-navigation-compose:1.3.0")
    implementation("androidx.hilt:hilt-work:1.3.0")
    ksp("androidx.hilt:hilt-compiler:1.3.0")
    implementation("com.google.dagger:hilt-android:2.60.1")
    ksp("com.google.dagger:hilt-compiler:2.60.1")
    implementation("androidx.room:room-runtime:2.8.5")
    implementation("androidx.room:room-ktx:2.8.5")
    ksp("androidx.room:room-compiler:2.8.5")
    implementation("androidx.work:work-runtime-ktx:2.11.2")
    implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.7.3")
    implementation("io.coil-kt.coil3:coil-compose:3.3.0")
    implementation("androidx.webkit:webkit:1.18.0")
    implementation("androidx.profileinstaller:profileinstaller:1.4.1")
    coreLibraryDesugaring("com.android.tools:desugar_jdk_libs:2.1.5")
    baselineProfile(project(":baselineprofile"))
    testImplementation(libs.junit)
    testImplementation("org.jetbrains.kotlinx:kotlinx-coroutines-test:1.10.2")
    androidTestImplementation(platform(libs.androidx.compose.bom))
    androidTestImplementation(libs.androidx.compose.ui.test.junit4)
    androidTestImplementation(libs.androidx.espresso.core)
    androidTestImplementation(libs.androidx.junit)
    androidTestImplementation("androidx.test:runner:1.7.0")
    debugImplementation(libs.androidx.compose.ui.test.manifest)
    debugImplementation(libs.androidx.compose.ui.tooling)
}
