plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.google.services) apply false
}

// Keep the starter build runnable until the real Android Firebase config is supplied.
if (file("google-services.json").exists()) {
    apply(plugin = "com.google.gms.google-services")
}

android {
    namespace = "com.mcl.mcllendingapp"
    compileSdk {
        version = release(37)
    }

    defaultConfig {
        applicationId = "com.mcl.mcllendingapp"
        minSdk = 24
        targetSdk = 37
        versionCode = 1
        versionName = "1.0"

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }

    buildTypes {
        release {
            optimization {
                enable = true
                packageScope = setOf("androidx.**", "kotlin.**", "kotlinx.**")
            }
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_11
        targetCompatibility = JavaVersion.VERSION_11
    }
    buildFeatures {
        compose = true
    }
}

// Build the APK interface from source, including current shared web pages and logo.
// Dependencies are installed from apps/web/package-lock.json (npm ci in apps/web).
val bundleMobile = tasks.register<Exec>("bundleMobile") {
    workingDir(rootProject.file("mobile"))
    commandLine(if (System.getProperty("os.name").startsWith("Windows")) "npm.cmd" else "npm", "run", "build")
    inputs.dir(rootProject.file("mobile/src"))
    inputs.file(rootProject.file("mobile/index.html"))
    inputs.file(rootProject.file("mobile/vite.config.mts"))
    inputs.file(rootProject.file("mobile/tsconfig.json"))
    inputs.dir(rootProject.file("../web/src"))
    inputs.dir(rootProject.file("../web/public"))
    inputs.file(rootProject.file("../web/package-lock.json"))
    inputs.files(fileTree(rootProject.file("../web")) { include(".env*") })
    outputs.dir(project.file("src/main/assets/mobile"))
}
// Generate the Android logo resource from the same source as the web/mobile UI.
val launcherLogoDirectory = layout.buildDirectory.dir("generated/launcherLogo/res")
val prepareLauncherLogo = tasks.register<Copy>("prepareLauncherLogo") {
    from(rootProject.file("../web/public/assets/logo.png"))
    into(launcherLogoDirectory.map { it.dir("drawable-nodpi") })
    rename { "mcl_logo.png" }
}
android.sourceSets.getByName("main").res.srcDir(launcherLogoDirectory.get().asFile)
tasks.named("preBuild") { dependsOn(bundleMobile, prepareLauncherLogo) }

dependencies {
    implementation("androidx.webkit:webkit:1.18.0")
    implementation(platform(libs.firebase.bom))
    implementation(libs.firebase.auth)
    implementation(libs.firebase.firestore)
    implementation(libs.kotlinx.coroutines.play.services)
    implementation(libs.androidx.lifecycle.viewmodel.compose)
    implementation(libs.androidx.lifecycle.runtime.compose)
    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.androidx.activity.compose)
    implementation(libs.androidx.compose.material3)
    implementation(libs.androidx.compose.ui)
    implementation(libs.androidx.compose.ui.graphics)
    implementation(libs.androidx.compose.ui.tooling.preview)
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.lifecycle.runtime.ktx)
    testImplementation(libs.junit)
    androidTestImplementation(platform(libs.androidx.compose.bom))
    androidTestImplementation(libs.androidx.compose.ui.test.junit4)
    androidTestImplementation(libs.androidx.espresso.core)
    androidTestImplementation(libs.androidx.junit)
    debugImplementation(libs.androidx.compose.ui.test.manifest)
    debugImplementation(libs.androidx.compose.ui.tooling)
}