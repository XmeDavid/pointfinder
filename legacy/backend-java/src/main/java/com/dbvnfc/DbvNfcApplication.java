package com.dbvnfc;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication
@EnableScheduling
public class DbvNfcApplication {

    public static void main(String[] args) {
        SpringApplication.run(DbvNfcApplication.java, args);
    }
}
