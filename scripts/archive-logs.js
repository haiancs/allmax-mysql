const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const { Op } = require("sequelize");
const { sequelize } = require("../db");
const SysLog = require("../repos/sysLogRepo");

// 配置项
const KEEP_DAYS = 30; // 保留最近 30 天的日志
const ARCHIVE_DIR = path.join(__dirname, "../logs/archive");
const BATCH_SIZE = 1000; // 分批处理大小
const DRY_RUN = process.env.DRY_RUN === 'true'; // 如果是 true，只归档不删除

async function archiveLogs() {
  try {
    // 1. 初始化
    await sequelize.authenticate();
    console.log("数据库连接成功");

    if (!fs.existsSync(ARCHIVE_DIR)) {
      fs.mkdirSync(ARCHIVE_DIR, { recursive: true });
    }

    // 2. 计算截止时间
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - KEEP_DAYS);
    console.log(`准备归档 ${cutoffDate.toISOString()} 之前的日志...`);

    // 3. 统计需要归档的日志数量
    const count = await SysLog.count({
      where: {
        createTime: {
          [Op.lt]: cutoffDate,
        },
      },
    });

    if (count === 0) {
      console.log("没有需要归档的日志。");
      process.exit(0);
    }

    console.log(`发现 ${count} 条日志需要归档。`);

    // 4. 创建输出流 (直接压缩)
    const dateStr = new Date().toISOString().split("T")[0];
    const filename = `logs-archive-${dateStr}-${Date.now()}.json.gz`;
    const filePath = path.join(ARCHIVE_DIR, filename);
    
    const fileStream = fs.createWriteStream(filePath);
    const gzip = zlib.createGzip();
    
    // 管道连接：数据 -> gzip -> 文件
    // 我们手动控制写入，所以这里不直接 pipe stream，而是分批写入 gzip
    gzip.pipe(fileStream);

    // 5. 分批导出并写入
    let processed = 0;
    
    // 写入 JSON 数组的开头
    gzip.write("[\n");

    while (processed < count) {
      const logs = await SysLog.findAll({
        where: {
          createdAt: {
            [Op.lt]: cutoffDate,
          },
        },
        limit: BATCH_SIZE,
        offset: processed,
        order: [["id", "ASC"]],
        raw: true,
      });

      if (logs.length === 0) break;

      for (let i = 0; i < logs.length; i++) {
        const log = logs[i];
        // 格式化为 JSON 字符串
        const line = JSON.stringify(log);
        // 如果不是第一条，加逗号和换行
        if (processed > 0 || i > 0) {
          gzip.write(",\n");
        }
        gzip.write(line);
      }

      processed += logs.length;
      console.log(`已导出 ${processed}/${count} 条...`);
    }

    // 写入 JSON 数组的结尾
    gzip.write("\n]");
    gzip.end();

    // 等待流结束
    await new Promise((resolve, reject) => {
      fileStream.on("finish", resolve);
      fileStream.on("error", reject);
    });

    console.log(`日志已导出并压缩至: ${filePath}`);

    // 6. 删除已归档的数据
    if (DRY_RUN) {
      console.log("DRY_RUN 模式：跳过删除步骤。");
    } else {
      console.log("开始清理数据库中的旧日志...");
      // 为了避免大事务，分批删除
      let deleted = 0;
      while (deleted < count) {
        const result = await SysLog.destroy({
          where: {
            createTime: {
              [Op.lt]: cutoffDate,
            },
          },
          limit: BATCH_SIZE,
        });
        
        if (result === 0) break;
        deleted += result;
        console.log(`已删除 ${deleted}/${count} 条...`);
      }
    }

    console.log("归档完成！");
    process.exit(0);

  } catch (error) {
    console.error("归档失败:", error);
    process.exit(1);
  }
}

archiveLogs();
