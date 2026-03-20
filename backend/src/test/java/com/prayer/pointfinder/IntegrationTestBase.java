package com.prayer.pointfinder;

import com.prayer.pointfinder.entity.*;
import com.prayer.pointfinder.repository.*;
import com.prayer.pointfinder.security.JwtTokenProvider;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.http.HttpHeaders;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import java.util.UUID;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@Testcontainers
@ActiveProfiles("test")
@ExtendWith(DockerAvailableCondition.class)
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
public abstract class IntegrationTestBase {

    @Container
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:16-alpine")
            .withDatabaseName("pointfinder_test")
            .withUsername("test")
            .withPassword("test");

    @DynamicPropertySource
    static void configureProperties(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url",
                () -> {
                    String url = postgres.getJdbcUrl();
                    String sep = url.contains("?") ? "&" : "?";
                    return url + sep + "stringtype=unspecified";
                });
        registry.add("spring.datasource.username", postgres::getUsername);
        registry.add("spring.datasource.password", postgres::getPassword);
    }

    @Autowired
    protected TestRestTemplate restTemplate;

    @Autowired
    protected GameRepository gameRepository;

    @Autowired
    protected UserRepository userRepository;

    @Autowired
    protected BaseRepository baseRepository;

    @Autowired
    protected ChallengeRepository challengeRepository;

    @Autowired
    protected TeamRepository teamRepository;

    @Autowired
    protected AssignmentRepository assignmentRepository;

    @Autowired
    protected CheckInRepository checkInRepository;

    @Autowired
    protected SubmissionRepository submissionRepository;

    @Autowired
    protected PlayerRepository playerRepository;

    @Autowired
    protected PasswordEncoder passwordEncoder;

    @Autowired
    protected JwtTokenProvider tokenProvider;

    @BeforeEach
    void cleanDatabase() {
        submissionRepository.deleteAll();
        checkInRepository.deleteAll();
        assignmentRepository.deleteAll();
        playerRepository.deleteAll();
        teamRepository.deleteAll();
        baseRepository.deleteAll();
        challengeRepository.deleteAll();
        gameRepository.deleteAll();
    }

    // ── Test Data Builders ──────────────────────────────────────────

    protected User createOperator(String email, String password) {
        User user = User.builder()
                .email(email)
                .name("Test Operator")
                .passwordHash(passwordEncoder.encode(password))
                .role(UserRole.operator)
                .build();
        return userRepository.save(user);
    }

    protected User createAdmin(String email, String password) {
        User user = User.builder()
                .email(email)
                .name("Test Admin")
                .passwordHash(passwordEncoder.encode(password))
                .role(UserRole.admin)
                .build();
        return userRepository.save(user);
    }

    protected Game createGame(User creator, String name, GameStatus status) {
        Game game = Game.builder()
                .name(name)
                .description("Test game description")
                .status(status)
                .createdBy(creator)
                .build();
        game.getOperators().add(creator);
        return gameRepository.save(game);
    }

    protected Base createBase(Game game, String name) {
        Base base = Base.builder()
                .game(game)
                .name(name)
                .description("Test base")
                .lat(47.0)
                .lng(8.0)
                .nfcLinked(true)
                .build();
        return baseRepository.save(base);
    }

    protected Challenge createChallenge(Game game, String title, AnswerType answerType, int points) {
        Challenge challenge = Challenge.builder()
                .game(game)
                .title(title)
                .description("Test challenge")
                .content("Challenge content")
                .completionContent("Well done!")
                .answerType(answerType)
                .autoValidate(false)
                .points(points)
                .locationBound(false)
                .build();
        return challengeRepository.save(challenge);
    }

    protected Team createTeam(Game game, String name, String joinCode) {
        Team team = Team.builder()
                .game(game)
                .name(name)
                .joinCode(joinCode)
                .color("#FF0000")
                .build();
        return teamRepository.save(team);
    }

    protected Player createPlayer(Team team, String displayName, String deviceId) {
        Player player = Player.builder()
                .team(team)
                .displayName(displayName)
                .deviceId(deviceId)
                .build();
        return playerRepository.save(player);
    }

    protected String operatorAuthHeader(User user) {
        String token = tokenProvider.generateAccessToken(user.getId(), user.getEmail(), user.getRole().name());
        return "Bearer " + token;
    }

    protected String playerAuthHeader(Player player) {
        String token = tokenProvider.generatePlayerToken(
                player.getId(), player.getTeam().getId(), player.getTeam().getGame().getId());
        return "Bearer " + token;
    }

    protected HttpHeaders headersWithAuth(String authHeader) {
        HttpHeaders headers = new HttpHeaders();
        headers.set("Authorization", authHeader);
        headers.set("Content-Type", "application/json");
        return headers;
    }
}
