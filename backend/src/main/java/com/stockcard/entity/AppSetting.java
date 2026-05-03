package com.stockcard.entity;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;

@Entity
@Table(name = "app_settings")
@Data
@NoArgsConstructor
public class AppSetting {

    @Id
    @Column(name = "setting_key", nullable = false, unique = true, length = 100)
    private String key;

    @Column(name = "setting_value", length = 2000)
    private String value;

    public AppSetting(String key, String value) {
        this.key = key;
        this.value = value;
    }
}
