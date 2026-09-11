import java.io.*;
import java.net.*;
import java.net.http.*;
import java.time.Duration;
import java.util.*;
import software.amazon.awssdk.auth.credentials.*;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.services.s3.*;
import software.amazon.awssdk.services.s3.model.*;
import software.amazon.awssdk.services.s3.presigner.*;
import software.amazon.awssdk.services.s3.presigner.model.*;

// Uses SDK jars extracted from the preserved application. Never print signed URLs.
public class S3ReleaseProbe {
  public static void main(String[] args) throws Exception {
    Properties p = new Properties(); p.load(System.in);
    String access = new String(Base64.getDecoder().decode(p.getProperty("access")));
    String secret = new String(Base64.getDecoder().decode(p.getProperty("secret")));
    String bucket = "pointfinder-prod-uploads-202609";
    String key = "_verification/release-sdk-" + UUID.randomUUID();
    var credentials = StaticCredentialsProvider.create(AwsBasicCredentials.create(access, secret));
    var endpoint = URI.create("https://fsn1.your-objectstorage.com");
    try (var s3 = S3Client.builder().endpointOverride(endpoint).region(Region.of("fsn1"))
        .credentialsProvider(credentials).forcePathStyle(true).build();
         var signer = S3Presigner.builder().endpointOverride(endpoint).region(Region.of("fsn1"))
        .credentialsProvider(credentials).build()) {
      byte[] content = "pointfinder-preserved-sdk-probe".getBytes();
      s3.putObject(PutObjectRequest.builder().bucket(bucket).key(key).contentType("text/plain").build(),
          RequestBody.fromBytes(content));
      System.out.println("probe_key=" + key);
      try {
        var request = GetObjectRequest.builder().bucket(bucket).key(key)
            .responseContentDisposition("inline; filename=\"probe.txt\"").build();
        var signed = signer.presignGetObject(GetObjectPresignRequest.builder()
            .signatureDuration(Duration.ofMinutes(2)).getObjectRequest(request).build());
        var response = HttpClient.newHttpClient().send(HttpRequest.newBuilder(signed.url().toURI())
            .timeout(Duration.ofSeconds(20)).GET().build(), HttpResponse.BodyHandlers.ofByteArray());
        if (response.statusCode()!=200 || !Arrays.equals(content,response.body()))
          throw new IllegalStateException("Presigned GET verification failed: " + response.statusCode());
        System.out.println("preserved_sdk_put_and_presigned_get=passed");
      } finally { s3.deleteObject(DeleteObjectRequest.builder().bucket(bucket).key(key).build()); }
    } catch (Exception e) {
      System.err.println("Probe failed: " + e.getClass().getSimpleName()); System.exit(1);
    }
  }
}
