interface ApplicationConfig {
    BACKEND_PORT: string;
    WEB3: string | undefined;
    WEB3_API_KEY: string | undefined;
    PRIVATE_KEY: string | undefined;
    MAIN_POOL_ADDRESS: string | undefined;
    TARGET_POOL_ADDRESS: string | undefined;
}

export default function createConfig(): ApplicationConfig {
    return {
        BACKEND_PORT: process.env.BACKEND_PORT ?? '3000',
        WEB3: process.env.WEB3,
        WEB3_API_KEY: process.env.WEB3_API_KEY,
        PRIVATE_KEY: process.env.PRIVATE_KEY,
        MAIN_POOL_ADDRESS: process.env.MAIN_POOL_ADDRESS,
        TARGET_POOL_ADDRESS: process.env.TARGET_POOL_ADDRESS,
    };
}
